// Wallet funding: customers pay into their own bank account number (a gateway "reserved" or
// "dedicated" account) and the money is credited to their wallet.
//
// How a payment is credited safely (CLAUDE.md rules 4 and 7):
// 1. The webhook's signature is checked. A bad signature is rejected (401) without doing anything.
// 2. We ask the gateway directly whether that transaction is paid, how much, and into which
//    account. Only the gateway's answer counts; the webhook's own amount is never used.
// 3. recordFunding() credits the wallet once per (gateway, transaction reference), however many
//    times the webhook arrives, even at the same moment.
// A backup job (reconcileFunding) lists each account's recent payments and credits any whose
// webhook never arrived, through the same steps.
import { type DbOrTx, schema } from "@repo/db";
import { and, eq } from "drizzle-orm";

import type { Kobo } from "../money.ts";
import { recordFunding } from "../wallet/wallet.ts";
import { fundingFeeKobo } from "./fees.ts";
import type { FundingGateway } from "./types.ts";

const { fundingAccounts, fundingEvents, users, wallets } = schema;

export type FundingAccount = typeof fundingAccounts.$inferSelect;

export type FundingErrorCode =
  "user_not_found" | "user_suspended" | "email_required" | "id_required";

export class FundingError extends Error {
  readonly code: FundingErrorCode;
  constructor(code: FundingErrorCode, message: string) {
    super(message);
    this.name = "FundingError";
    this.code = code;
  }
}

const ID_NUMBER = /^\d{11}$/;

export interface CreateFundingAccountsInput {
  userId: string;
  /** The customer's BVN or NIN. Passed to the gateway, never stored. */
  bvn?: string;
  nin?: string;
}

/** The customer's funding account numbers, newest bank first. */
export async function listFundingAccounts(db: DbOrTx, userId: string): Promise<FundingAccount[]> {
  return db.select().from(fundingAccounts).where(eq(fundingAccounts.userId, userId));
}

/**
 * Gives the customer their own account number(s) to fund the wallet. Safe to call again: if they
 * already have accounts with this gateway, those are returned and the gateway isn't asked again.
 */
export async function createFundingAccounts(
  db: DbOrTx,
  gateway: FundingGateway,
  input: CreateFundingAccountsInput,
): Promise<{ accounts: FundingAccount[]; created: boolean }> {
  const [user] = await db.select().from(users).where(eq(users.id, input.userId));
  if (!user) throw new FundingError("user_not_found", "Account not found");
  if (user.status !== "active") {
    throw new FundingError("user_suspended", "This account can't be funded right now");
  }

  const existing = await db
    .select()
    .from(fundingAccounts)
    .where(and(eq(fundingAccounts.userId, user.id), eq(fundingAccounts.gateway, gateway.name)));
  if (existing.length > 0) return { accounts: existing, created: false };

  if (!user.email) {
    throw new FundingError(
      "email_required",
      "Add an email address before creating a funding account",
    );
  }
  const bvn = input.bvn?.trim();
  const nin = input.nin?.trim();
  const hasBvn = bvn !== undefined && ID_NUMBER.test(bvn);
  const hasNin = nin !== undefined && ID_NUMBER.test(nin);
  if (!hasBvn && !hasNin) {
    throw new FundingError("id_required", "Enter your 11-digit BVN or NIN");
  }

  const reserved = await gateway.reserveAccount({
    accountReference: user.id,
    customerName: user.fullName,
    customerEmail: user.email,
    ...(hasBvn ? { bvn } : { nin }),
  });

  await db
    .insert(fundingAccounts)
    .values(
      reserved.accounts.map((a) => ({
        userId: user.id,
        gateway: gateway.name,
        accountReference: reserved.accountReference,
        bankCode: a.bankCode,
        bankName: a.bankName,
        accountNumber: a.accountNumber,
        accountName: a.accountName,
      })),
    )
    .onConflictDoNothing();

  return { accounts: await listFundingAccounts(db, user.id), created: true };
}

export type CreditOutcome = "credited" | "duplicate" | "not_paid" | "unknown_account";

export interface CreditResult {
  outcome: CreditOutcome;
  transactionReference: string;
  /** What the customer sent. */
  amountKobo?: Kobo;
  /** Our funding fee. */
  feeKobo?: Kobo;
  /** What the wallet received (amountKobo − feeKobo). */
  creditedKobo?: Kobo;
  walletId?: string;
}

/**
 * Asks the gateway about a transaction and credits the matching wallet if (and only if) the
 * gateway confirms it is paid. Credits at most once per transaction. Throws if the gateway can't
 * answer, so the caller can retry later; nothing is credited in that case.
 */
export async function confirmAndCredit(
  db: DbOrTx,
  gateway: FundingGateway,
  transactionReference: string,
  webhookBody?: unknown,
): Promise<CreditResult> {
  const payment = await gateway.verifyPayment(transactionReference);
  if (!payment.paid || payment.amountKobo <= 0) {
    return { outcome: "not_paid", transactionReference };
  }
  if (!payment.accountReference) return { outcome: "unknown_account", transactionReference };

  const [owner] = await db
    .select({ walletId: wallets.id })
    .from(fundingAccounts)
    .innerJoin(wallets, eq(wallets.userId, fundingAccounts.userId))
    .where(
      and(
        eq(fundingAccounts.gateway, gateway.name),
        eq(fundingAccounts.accountReference, payment.accountReference),
      ),
    )
    .limit(1);
  if (!owner) return { outcome: "unknown_account", transactionReference };

  const { duplicate, fundingEvent } = await recordFunding(db, {
    walletId: owner.walletId,
    gateway: gateway.name,
    gatewayReference: transactionReference,
    amountKobo: payment.amountKobo,
    feeKobo: fundingFeeKobo(payment.amountKobo),
    raw: { verified: payment.raw, webhook: webhookBody ?? null },
  });
  return {
    outcome: duplicate ? "duplicate" : "credited",
    transactionReference,
    amountKobo: fundingEvent.amountKobo,
    feeKobo: fundingEvent.feeKobo,
    creditedKobo: fundingEvent.amountKobo - fundingEvent.feeKobo,
    walletId: owner.walletId,
  };
}

export interface WebhookResult {
  /** What to answer the gateway: 200 done (don't resend), 401 rejected, 500 please retry. */
  httpStatus: 200 | 401 | 500;
  outcome: CreditOutcome | "ignored" | "rejected" | "error";
  transactionReference?: string;
  amountKobo?: Kobo;
  feeKobo?: Kobo;
  creditedKobo?: Kobo;
  reason?: string;
}

/** Handles a gateway webhook end to end. Never throws: the result says what to answer. */
export async function handleFundingWebhook(
  db: DbOrTx,
  gateway: FundingGateway,
  request: { rawBody: string; headers: Headers },
): Promise<WebhookResult> {
  const signature = gateway.checkWebhookSignature(request.rawBody, request.headers);
  if (!signature.ok) return { httpStatus: 401, outcome: "rejected", reason: signature.reason };

  const event = gateway.parseWebhook(request.rawBody);
  if (event.kind === "ignored")
    return { httpStatus: 200, outcome: "ignored", reason: event.reason };

  let webhookBody: unknown = null;
  try {
    webhookBody = JSON.parse(request.rawBody);
  } catch {
    // parseWebhook already accepted it; keep null
  }
  try {
    const result = await confirmAndCredit(db, gateway, event.transactionReference, webhookBody);
    return { httpStatus: 200, ...result };
  } catch (error) {
    return {
      httpStatus: 500,
      outcome: "error",
      transactionReference: event.transactionReference,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface ReconcileSummary {
  accounts: number;
  /** Payments asked about (already-recorded ones are skipped without asking). */
  checked: number;
  credited: number;
  notPaid: number;
  unknownAccount: number;
  errors: number;
}

/**
 * Backup for lost webhooks: for every funding account, list recent payments at the gateway and
 * credit any not yet recorded. Safe to run any time and repeatedly.
 */
export async function reconcileFunding(
  db: DbOrTx,
  gateway: FundingGateway,
  options: { log?: (message: string) => void } = {},
): Promise<ReconcileSummary> {
  const log = options.log ?? console.error;
  const references = await db
    .selectDistinct({ accountReference: fundingAccounts.accountReference })
    .from(fundingAccounts)
    .where(eq(fundingAccounts.gateway, gateway.name));

  const summary: ReconcileSummary = {
    accounts: references.length,
    checked: 0,
    credited: 0,
    notPaid: 0,
    unknownAccount: 0,
    errors: 0,
  };

  for (const { accountReference } of references) {
    let payments: string[];
    try {
      payments = await gateway.listAccountPayments(accountReference);
    } catch (error) {
      summary.errors++;
      log(
        `Couldn't list payments for ${accountReference}: ${error instanceof Error ? error.message : error}`,
      );
      continue;
    }
    for (const transactionReference of payments) {
      const [known] = await db
        .select({ id: fundingEvents.id })
        .from(fundingEvents)
        .where(
          and(
            eq(fundingEvents.gateway, gateway.name),
            eq(fundingEvents.gatewayReference, transactionReference),
          ),
        );
      if (known) continue;

      summary.checked++;
      try {
        const result = await confirmAndCredit(db, gateway, transactionReference);
        if (result.outcome === "credited") summary.credited++;
        else if (result.outcome === "not_paid") summary.notPaid++;
        else if (result.outcome === "unknown_account") summary.unknownAccount++;
      } catch (error) {
        summary.errors++;
        log(
          `Couldn't confirm ${transactionReference}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }
  return summary;
}
