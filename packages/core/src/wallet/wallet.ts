// The wallet ledger. The only code allowed to change a wallet's balance.
//
// How money stays safe (see CLAUDE.md "money safety"):
// 1. Every change is a new row in ledger_entries; rows are never edited or deleted.
// 2. wallets.balance_kobo is a cached copy, updated in the SAME transaction as the ledger insert,
//    so the two can never disagree.
// 3. The wallet row is locked (SELECT ... FOR UPDATE) for the whole transaction, so two requests
//    for the same wallet take turns: the second sees the first one's result before deciding.
// 4. (reason, reference) is unique: an order is debited once and refunded once, and a funding
//    event credited once, however many times the call is retried.
import { type DbOrTx, schema } from "@repo/db";
import { and, eq, sql } from "drizzle-orm";

import { isUniqueViolation } from "../db-errors.ts";
import { formatNaira, type Kobo } from "../money.ts";

const { auditLog, fundingEvents, ledgerEntries, wallets } = schema;

export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type FundingEvent = typeof fundingEvents.$inferSelect;

export type CreditReason = "funding" | "refund" | "admin_credit" | "seed";
export type DebitReason = "purchase" | "admin_debit";

const CREDIT_REASONS: ReadonlySet<string> = new Set<CreditReason>([
  "funding",
  "refund",
  "admin_credit",
  "seed",
]);
const DEBIT_REASONS: ReadonlySet<string> = new Set<DebitReason>(["purchase", "admin_debit"]);
const ADMIN_REASONS: ReadonlySet<string> = new Set(["admin_credit", "admin_debit"]);

interface MovementInput<Reason> {
  walletId: string;
  amountKobo: Kobo;
  reason: Reason;
  /**
   * What caused this movement: the order id for purchase/refund, the funding event id for funding.
   * A retry with the same reason + reference returns the original entry instead of moving money.
   */
  referenceId?: string | null;
  description?: string | null;
  /** The admin making a manual entry. Required for admin_credit / admin_debit. */
  createdBy?: string | null;
}

export type CreditInput = MovementInput<CreditReason>;
export type DebitInput = MovementInput<DebitReason>;

export interface MovementResult {
  entry: LedgerEntry;
  /** true when this reference was already recorded, so nothing moved this time. */
  duplicate: boolean;
}

export class WalletNotFoundError extends Error {
  readonly walletId: string;
  constructor(walletId: string) {
    super(`Wallet ${walletId} does not exist`);
    this.name = "WalletNotFoundError";
    this.walletId = walletId;
  }
}

export class InsufficientFundsError extends Error {
  readonly walletId: string;
  readonly balanceKobo: Kobo;
  readonly requestedKobo: Kobo;
  constructor(walletId: string, balanceKobo: Kobo, requestedKobo: Kobo) {
    super(`Insufficient funds: balance ${balanceKobo} kobo, needs ${requestedKobo} kobo`);
    this.name = "InsufficientFundsError";
    this.walletId = walletId;
    this.balanceKobo = balanceKobo;
    this.requestedKobo = requestedKobo;
  }
}

/** A reference was reused for a different movement. That is a bug or an attack, never a retry. */
export class ReferenceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceConflictError";
  }
}

/** Adds money to a wallet. */
export async function credit(db: DbOrTx, input: CreditInput): Promise<MovementResult> {
  if (!CREDIT_REASONS.has(input.reason)) {
    throw new TypeError(`"${input.reason}" is not a credit reason`);
  }
  return move(db, "credit", input);
}

/** Takes money from a wallet. Throws InsufficientFundsError (writing nothing) if it would go below zero. */
export async function debit(db: DbOrTx, input: DebitInput): Promise<MovementResult> {
  if (!DEBIT_REASONS.has(input.reason)) {
    throw new TypeError(`"${input.reason}" is not a debit reason`);
  }
  return move(db, "debit", input);
}

/** The wallet's balance in kobo (the cached copy; always equal to the ledger sum). */
export async function getBalance(db: DbOrTx, walletId: string): Promise<Kobo> {
  const [wallet] = await db
    .select({ balanceKobo: wallets.balanceKobo })
    .from(wallets)
    .where(eq(wallets.id, walletId));
  if (!wallet) throw new WalletNotFoundError(walletId);
  return wallet.balanceKobo;
}

/** Recomputes the balance from the ledger itself. Used by tests and future reconciliation checks. */
export async function getLedgerBalance(db: DbOrTx, walletId: string): Promise<Kobo> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(case when ${ledgerEntries.direction} = 'credit'
        then ${ledgerEntries.amountKobo} else -${ledgerEntries.amountKobo} end), 0)::text`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.walletId, walletId));
  const total = Number(row?.total ?? "0");
  if (!Number.isSafeInteger(total))
    throw new RangeError(`Ledger total out of range: ${row?.total}`);
  return total;
}

export interface FundingInput {
  walletId: string;
  /** e.g. "monnify" or "paystack". */
  gateway: string;
  /** The gateway's reference for this payment. */
  gatewayReference: string;
  /** What the customer sent (gross), in kobo. */
  amountKobo: Kobo;
  /** Our funding fee, in kobo (default 0). The wallet is credited amountKobo − feeKobo. */
  feeKobo?: Kobo;
  /** The gateway's payload, kept for audits. */
  raw?: unknown;
}

export interface FundingResult extends MovementResult {
  fundingEvent: FundingEvent;
}

/**
 * Records money received from a payment gateway and credits the wallet, exactly once per
 * (gateway, gatewayReference). Call it only AFTER the webhook signature has been checked and the
 * payment re-confirmed with the gateway (CLAUDE.md rule 7); that comes with wallet funding.
 */
export async function recordFunding(db: DbOrTx, input: FundingInput): Promise<FundingResult> {
  assertPositiveKobo(input.amountKobo);
  const feeKobo = input.feeKobo ?? 0;
  if (
    !Number.isSafeInteger(feeKobo) ||
    feeKobo < 0 ||
    (feeKobo > 0 && feeKobo >= input.amountKobo)
  ) {
    throw new RangeError(
      `Funding fee must be a whole number of kobo below the amount received, got ${feeKobo}`,
    );
  }
  return db.transaction(async (tx) => {
    // If another request inserted this reference first, this waits for it to finish, then skips.
    const [inserted] = await tx
      .insert(fundingEvents)
      .values({
        walletId: input.walletId,
        gateway: input.gateway,
        gatewayReference: input.gatewayReference,
        amountKobo: input.amountKobo,
        feeKobo,
        status: "credited",
        raw: input.raw ?? null,
      })
      .onConflictDoNothing({ target: [fundingEvents.gateway, fundingEvents.gatewayReference] })
      .returning();

    if (inserted) {
      const { entry } = await credit(tx, {
        walletId: input.walletId,
        amountKobo: input.amountKobo - feeKobo,
        reason: "funding",
        referenceId: inserted.id,
        description:
          feeKobo > 0
            ? `${input.gateway} ${input.gatewayReference}: ${formatNaira(input.amountKobo)} received, ${formatNaira(feeKobo)} fee`
            : `${input.gateway} ${input.gatewayReference}`,
      });
      return { fundingEvent: inserted, entry, duplicate: false };
    }

    // Already recorded: return the original, but refuse if the details don't match.
    const [existing] = await tx
      .select()
      .from(fundingEvents)
      .where(
        and(
          eq(fundingEvents.gateway, input.gateway),
          eq(fundingEvents.gatewayReference, input.gatewayReference),
        ),
      );
    if (
      !existing ||
      existing.walletId !== input.walletId ||
      existing.amountKobo !== input.amountKobo
    ) {
      throw new ReferenceConflictError(
        `Funding ${input.gateway} ${input.gatewayReference} was already recorded with a ` +
          "different wallet or amount",
      );
    }
    const entry = await findEntry(tx, "funding", existing.id);
    if (!entry) throw new Error(`Funding ${existing.id} has no ledger entry`);
    return { fundingEvent: existing, entry, duplicate: true };
  });
}

// ---------------------------------------------------------------------------------------------

function assertPositiveKobo(amountKobo: Kobo): void {
  if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) {
    throw new RangeError(`Amount must be a positive whole number of kobo, got ${amountKobo}`);
  }
}

async function findEntry(db: DbOrTx, reason: string, referenceId: string) {
  const [entry] = await db
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.reason, reason as LedgerEntry["reason"]),
        eq(ledgerEntries.referenceId, referenceId),
      ),
    );
  return entry;
}

/** Returns the existing entry if it is the same movement, or throws if the reference is misused. */
function sameMovementOrThrow(
  existing: LedgerEntry,
  direction: "credit" | "debit",
  input: MovementInput<string>,
): MovementResult {
  if (
    existing.walletId !== input.walletId ||
    existing.amountKobo !== input.amountKobo ||
    existing.direction !== direction
  ) {
    throw new ReferenceConflictError(
      `Reference "${input.referenceId}" was already used for a different ${input.reason} ` +
        `(${existing.direction} of ${existing.amountKobo} kobo on wallet ${existing.walletId})`,
    );
  }
  return { entry: existing, duplicate: true };
}

async function move(
  db: DbOrTx,
  direction: "credit" | "debit",
  input: MovementInput<string>,
): Promise<MovementResult> {
  assertPositiveKobo(input.amountKobo);
  const isAdmin = ADMIN_REASONS.has(input.reason);
  if (isAdmin && !input.createdBy) {
    throw new TypeError(`${input.reason} needs createdBy (the admin's user id) for the audit log`);
  }
  const referenceId = input.referenceId ?? null;

  try {
    // When `db` is already a transaction (e.g. the purchase flow), this becomes a savepoint inside it.
    return await db.transaction(async (tx) => {
      // 1. Lock the wallet row. Anyone else touching this wallet now waits until we commit.
      const [wallet] = await tx
        .select({ balanceKobo: wallets.balanceKobo })
        .from(wallets)
        .where(eq(wallets.id, input.walletId))
        .for("update");
      if (!wallet) throw new WalletNotFoundError(input.walletId);

      // 2. Already done? (A retry. Under the lock we see any earlier request's committed result.)
      if (referenceId) {
        const existing = await findEntry(tx, input.reason, referenceId);
        if (existing) return sameMovementOrThrow(existing, direction, input);
      }

      // 3. Work out the new balance; refuse to go below zero.
      const before = wallet.balanceKobo;
      const after = direction === "credit" ? before + input.amountKobo : before - input.amountKobo;
      if (after < 0) throw new InsufficientFundsError(input.walletId, before, input.amountKobo);
      if (!Number.isSafeInteger(after)) throw new RangeError("Balance out of range");

      // 4. Write the statement line, then the cached balance, in this same transaction.
      const [entry] = await tx
        .insert(ledgerEntries)
        .values({
          walletId: input.walletId,
          direction,
          amountKobo: input.amountKobo,
          balanceAfterKobo: after,
          reason: input.reason as LedgerEntry["reason"],
          referenceId,
          description: input.description ?? null,
          createdBy: input.createdBy ?? null,
        })
        .returning();
      await tx
        .update(wallets)
        .set({ balanceKobo: after, updatedAt: sql`now()` })
        .where(eq(wallets.id, input.walletId));

      // 5. Manual admin changes are audited with before/after values (CLAUDE.md rule 9).
      if (isAdmin) {
        await tx.insert(auditLog).values({
          actorUserId: input.createdBy ?? null,
          action: `wallet.${input.reason}`,
          entityType: "wallet",
          entityId: input.walletId,
          before: { balanceKobo: before },
          after: { balanceKobo: after, ledgerEntryId: entry!.id },
          reason: input.description ?? null,
        });
      }
      return { entry: entry!, duplicate: false };
    });
  } catch (error) {
    // Backstop: the same reference was used on another wallet at the same moment, and the
    // database's unique index stopped the second one. Report it like the in-lock check would.
    if (referenceId && isUniqueViolation(error)) {
      const existing = await findEntry(db, input.reason, referenceId);
      if (existing) return sameMovementOrThrow(existing, direction, input);
    }
    throw error;
  }
}
