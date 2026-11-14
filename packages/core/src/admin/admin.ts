// Admin actions and views. Every change writes an audit_log row with before/after values
// (CLAUDE.md rule 9), in the same transaction as the change itself.
// Callers (API routes) must check assertAdmin() first; these functions trust adminId.
import { type DbOrTx, schema } from "@repo/db";
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";

import { pageOf, type Page } from "../account/account.ts";
import type { Kobo } from "../money.ts";
import type { ErrorResponse } from "../orders/http.ts";
import { settleOrder } from "../orders/purchase.ts";
import { credit, debit, type MovementResult } from "../wallet/wallet.ts";

const {
  auditLog,
  fundingAccounts,
  fundingEvents,
  ledgerEntries,
  orders,
  prices,
  products,
  users,
  wallets,
} = schema;

export type AdminErrorCode =
  "forbidden" | "not_found" | "invalid_input" | "price_below_cost" | "order_not_pending";

export class AdminError extends Error {
  readonly code: AdminErrorCode;
  constructor(code: AdminErrorCode, message: string) {
    super(message);
    this.name = "AdminError";
    this.code = code;
  }
}

/** Throws forbidden unless this is an active admin. */
export function assertAdmin(user: { role: string; status: string }): void {
  if (user.role !== "admin" || user.status !== "active") {
    throw new AdminError("forbidden", "Admins only");
  }
}

function requireNote(note: string | undefined, what: string): string {
  const trimmed = note?.trim() ?? "";
  if (trimmed.length < 3)
    throw new AdminError("invalid_input", `Add a short note explaining ${what}`);
  return trimmed.slice(0, 500);
}

// --- Money -------------------------------------------------------------------------------------

export interface AdjustWalletInput {
  adminId: string;
  userId: string;
  direction: "credit" | "debit";
  amountKobo: Kobo;
  /** Why: shown in the audit log and on the customer's statement. Required. */
  note: string;
  /**
   * A one-time key from the admin screen (e.g. generated when the form opens). Repeating it
   * (double-click, retry) returns the first result instead of moving money again.
   */
  idempotencyKey: string;
}

/** Manual credit/debit through the ledger; audited inside the wallet service. */
export async function adjustWallet(db: DbOrTx, input: AdjustWalletInput): Promise<MovementResult> {
  const note = requireNote(input.note, "this adjustment");
  const key = input.idempotencyKey.trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(key)) {
    throw new AdminError("invalid_input", "Missing or invalid idempotency key");
  }
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, input.userId));
  if (!wallet) throw new AdminError("not_found", "Customer not found");

  const movement = {
    walletId: wallet.id,
    amountKobo: input.amountKobo,
    referenceId: `admin:${key}`,
    description: note,
    createdBy: input.adminId,
  };
  return input.direction === "credit"
    ? credit(db, { ...movement, reason: "admin_credit" })
    : debit(db, { ...movement, reason: "admin_debit" });
}

// --- Prices and products -------------------------------------------------------------------------

export interface UpdatePriceInput {
  adminId: string;
  productId: string;
  tier: "regular" | "reseller";
  /** Data plans: the customer price in kobo. */
  priceKobo?: Kobo;
  /** Airtime: the discount in basis points (0–9,999; 100 = 1%). */
  discountBps?: number;
  /** Data only: allow a price below what the provider charges us (e.g. a promo). */
  allowBelowCost?: boolean;
  note?: string;
}

export async function updatePrice(db: DbOrTx, input: UpdatePriceInput) {
  return db.transaction(async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.id, input.productId));
    if (!product) throw new AdminError("not_found", "Product not found");

    let values: { priceKobo: Kobo | null; discountBps: number | null };
    if (product.category === "data") {
      const price = input.priceKobo;
      if (
        input.discountBps !== undefined ||
        price === undefined ||
        !Number.isSafeInteger(price) ||
        price <= 0
      ) {
        throw new AdminError("invalid_input", "Data plans need a price in whole kobo above zero");
      }
      if (
        product.providerPriceKobo !== null &&
        price < product.providerPriceKobo &&
        !input.allowBelowCost
      ) {
        throw new AdminError(
          "price_below_cost",
          `That's below what the provider charges us (${product.providerPriceKobo} kobo). Confirm to sell at a loss.`,
        );
      }
      values = { priceKobo: price, discountBps: null };
    } else {
      const bps = input.discountBps;
      if (
        input.priceKobo !== undefined ||
        bps === undefined ||
        !Number.isInteger(bps) ||
        bps < 0 ||
        bps >= 10_000
      ) {
        throw new AdminError(
          "invalid_input",
          "Airtime needs a discount between 0 and 9,999 basis points",
        );
      }
      values = { priceKobo: null, discountBps: bps };
    }

    const [existing] = await tx
      .select()
      .from(prices)
      .where(and(eq(prices.productId, product.id), eq(prices.tier, input.tier)))
      .for("update");
    const [saved] = await tx
      .insert(prices)
      .values({ productId: product.id, tier: input.tier, ...values })
      .onConflictDoUpdate({
        target: [prices.productId, prices.tier],
        set: { ...values, updatedAt: sql`now()` },
      })
      .returning();

    await tx.insert(auditLog).values({
      actorUserId: input.adminId,
      action: "price.update",
      entityType: "price",
      entityId: `${product.id}:${input.tier}`,
      before: existing
        ? { priceKobo: existing.priceKobo, discountBps: existing.discountBps }
        : null,
      after: values,
      reason: input.note?.trim() || null,
    });
    return saved!;
  });
}

export async function setProductActive(
  db: DbOrTx,
  input: { adminId: string; productId: string; active: boolean; note?: string },
) {
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update");
    if (!product) throw new AdminError("not_found", "Product not found");
    await tx
      .update(products)
      .set({ isActive: input.active, updatedAt: sql`now()` })
      .where(eq(products.id, product.id));
    await tx.insert(auditLog).values({
      actorUserId: input.adminId,
      action: input.active ? "product.activate" : "product.deactivate",
      entityType: "product",
      entityId: product.id,
      before: { isActive: product.isActive },
      after: { isActive: input.active },
      reason: input.note?.trim() || null,
    });
  });
}

// --- Customers -----------------------------------------------------------------------------------

export async function setUserStatus(
  db: DbOrTx,
  input: { adminId: string; userId: string; status: "active" | "suspended"; note: string },
) {
  if (input.userId === input.adminId) {
    throw new AdminError("invalid_input", "You can't change your own account status");
  }
  const note = requireNote(input.note, "this change");
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, input.userId)).for("update");
    if (!user) throw new AdminError("not_found", "Customer not found");
    await tx
      .update(users)
      .set({ status: input.status, updatedAt: sql`now()` })
      .where(eq(users.id, user.id));
    await tx.insert(auditLog).values({
      actorUserId: input.adminId,
      action: input.status === "suspended" ? "user.suspend" : "user.activate",
      entityType: "user",
      entityId: user.id,
      before: { status: user.status },
      after: { status: input.status },
      reason: note,
    });
  });
}

// --- Orders --------------------------------------------------------------------------------------

/**
 * Settles an order stuck in `pending` by hand, after checking with the provider (e.g. VTpass 044
 * "contact VTpass"). `failed` refunds the customer once; `success` keeps the charge.
 */
export async function settleOrderManually(
  db: DbOrTx,
  input: { adminId: string; orderId: string; outcome: "success" | "failed"; note: string },
) {
  const note = requireNote(input.note, "how you confirmed this");
  return db.transaction(async (tx) => {
    const { order, changed } = await settleOrder(tx, input.orderId, {
      status: input.outcome,
      requestId: "",
      providerCode: "MANUAL",
      message: `Settled by admin: ${note}`,
      providerReference: null,
      providerAmountKobo: null,
      raw: { manual: true, adminId: input.adminId },
    }).catch((error: unknown) => {
      if (error instanceof Error && /does not exist/.test(error.message)) {
        throw new AdminError("not_found", "Order not found");
      }
      throw error;
    });
    if (!changed) {
      throw new AdminError("order_not_pending", `This order is already ${order.status}`);
    }
    await tx.insert(auditLog).values({
      actorUserId: input.adminId,
      action: "order.settle",
      entityType: "order",
      entityId: order.id,
      before: { status: "pending" },
      after: { status: order.status, refunded: order.refundedAt !== null },
      reason: note,
    });
    return order;
  });
}

// --- Read-only views -----------------------------------------------------------------------------

const userColumns = {
  id: users.id,
  fullName: users.fullName,
  email: users.email,
  phone: users.phone,
  tier: users.tier,
  status: users.status,
  role: users.role,
  createdAt: users.createdAt,
  balanceKobo: sql<number>`coalesce(${wallets.balanceKobo}, 0)`.mapWith(Number),
};

/** Customers, newest first; `search` matches name, email or phone. */
export async function listUsers(db: DbOrTx, options: Page & { search?: string } = {}) {
  const { limit, offset } = pageOf(options);
  const term = options.search?.trim();
  const pattern = term ? `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const rows = await db
    .select(userColumns)
    .from(users)
    .leftJoin(wallets, eq(wallets.userId, users.id))
    .where(
      pattern
        ? or(
            ilike(users.fullName, pattern),
            ilike(users.email, pattern),
            ilike(users.phone, pattern),
          )
        : undefined,
    )
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(limit + 1)
    .offset(offset);
  return { users: rows.slice(0, limit), hasMore: rows.length > limit };
}

/** One customer with balance, PIN state and funding accounts (never the PIN hash). */
export async function getUserDetail(db: DbOrTx, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const [row] = await db
    .select({
      ...userColumns,
      walletId: wallets.id,
      hasPin: sql<boolean>`${users.pinHash} is not null`,
      pinLocked: sql<boolean>`${users.pinLockedAt} is not null`,
      phoneVerifiedAt: users.phoneVerifiedAt,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .leftJoin(wallets, eq(wallets.userId, users.id))
    .where(eq(users.id, userId));
  if (!row) return null;
  const accounts = await db
    .select({
      bankName: fundingAccounts.bankName,
      accountNumber: fundingAccounts.accountNumber,
      accountName: fundingAccounts.accountName,
    })
    .from(fundingAccounts)
    .where(eq(fundingAccounts.userId, userId));
  const [orderCount] = await db
    .select({ n: count() })
    .from(orders)
    .where(eq(orders.userId, userId));
  return { ...row, fundingAccounts: accounts, orderCount: orderCount?.n ?? 0 };
}

/** All orders, newest first. `stuckOnly`: pending for over 24 hours (need a human). */
export async function listOrdersAdmin(
  db: DbOrTx,
  options: Page & {
    status?: "pending" | "success" | "failed";
    stuckOnly?: boolean;
    userId?: string;
    /** Part of the recipient's phone number; only its digits are used. */
    phone?: string;
  } = {},
) {
  const { limit, offset } = pageOf(options);
  const phoneDigits = options.phone?.replace(/\D/g, "") ?? "";
  const rows = await db
    .select({
      id: orders.id,
      requestId: orders.requestId,
      status: orders.status,
      userId: orders.userId,
      userName: users.fullName,
      productName: products.name,
      recipientPhone: orders.recipientPhone,
      amountKobo: orders.amountKobo,
      faceValueKobo: orders.faceValueKobo,
      providerCode: orders.providerCode,
      providerMessage: orders.providerMessage,
      attempts: orders.attempts,
      createdAt: orders.createdAt,
      refundedAt: orders.refundedAt,
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .innerJoin(products, eq(products.id, orders.productId))
    .where(
      and(
        options.status ? eq(orders.status, options.status) : undefined,
        options.userId ? eq(orders.userId, options.userId) : undefined,
        phoneDigits ? ilike(orders.recipientPhone, `%${phoneDigits}%`) : undefined,
        options.stuckOnly
          ? and(
              eq(orders.status, "pending"),
              sql`${orders.createdAt} < now() - interval '24 hours'`,
            )
          : undefined,
      ),
    )
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(limit + 1)
    .offset(offset);
  return { orders: rows.slice(0, limit), hasMore: rows.length > limit };
}

/** Every product (active or not) with the provider's cost and each tier's price. */
export async function listProductsAdmin(db: DbOrTx) {
  const rows = await db
    .select()
    .from(products)
    .orderBy(
      asc(products.network),
      asc(products.category),
      asc(products.providerPriceKobo),
      asc(products.name),
    );
  const allPrices = await db.select().from(prices);
  return rows.map((p) => ({
    id: p.id,
    category: p.category,
    network: p.network,
    name: p.name,
    providerId: p.providerId,
    providerServiceId: p.providerServiceId,
    providerVariationCode: p.providerVariationCode,
    providerPriceKobo: p.providerPriceKobo,
    isActive: p.isActive,
    prices: allPrices
      .filter((pr) => pr.productId === p.id)
      .map((pr) => ({ tier: pr.tier, priceKobo: pr.priceKobo, discountBps: pr.discountBps })),
  }));
}

/** The audit log, newest first, optionally for one entity. */
export async function listAuditLog(
  db: DbOrTx,
  options: Page & { entityType?: string; entityId?: string } = {},
) {
  const { limit, offset } = pageOf(options);
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      before: auditLog.before,
      after: auditLog.after,
      reason: auditLog.reason,
      actorUserId: auditLog.actorUserId,
      actorName: users.fullName,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(
      and(
        options.entityType ? eq(auditLog.entityType, options.entityType) : undefined,
        options.entityId ? eq(auditLog.entityId, options.entityId) : undefined,
      ),
    )
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit + 1)
    .offset(offset);
  return { entries: rows.slice(0, limit), hasMore: rows.length > limit };
}

/** Turns a SQL bigint total (sent back as text) into a safe whole-kobo number. */
function koboTotal(value: string | null | undefined): Kobo {
  const total = Number(value ?? "0");
  if (!Number.isSafeInteger(total)) throw new RangeError(`Total out of range: ${value}`);
  return total;
}

/**
 * The admin home screen's numbers. "Today" is the current day in Lagos.
 * `ledgerMatches` compares every wallet's cached balance with the ledger (rule 1): if it is ever
 * false, something wrote a balance without a ledger entry and needs investigating.
 */
export async function getAdminOverview(db: DbOrTx, now: Date = new Date()) {
  const dayStart = sql`(date_trunc('day', ${now.toISOString()}::timestamptz at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')`;
  const [orderRow] = await db
    .select({
      salesKobo: sql<string>`coalesce(sum(${orders.amountKobo}) filter (where ${orders.status} = 'success' and ${orders.createdAt} >= ${dayStart}), 0)::text`,
      successCount:
        sql<number>`count(*) filter (where ${orders.status} = 'success' and ${orders.createdAt} >= ${dayStart})`.mapWith(
          Number,
        ),
      failedCount:
        sql<number>`count(*) filter (where ${orders.status} = 'failed' and ${orders.createdAt} >= ${dayStart})`.mapWith(
          Number,
        ),
      pendingCount: sql<number>`count(*) filter (where ${orders.status} = 'pending')`.mapWith(
        Number,
      ),
      stuckCount:
        sql<number>`count(*) filter (where ${orders.status} = 'pending' and ${orders.createdAt} < ${now.toISOString()}::timestamptz - interval '24 hours')`.mapWith(
          Number,
        ),
    })
    .from(orders);
  const [fundingRow] = await db
    .select({
      fundedKobo: sql<string>`coalesce(sum(${fundingEvents.amountKobo}), 0)::text`,
      feesKobo: sql<string>`coalesce(sum(${fundingEvents.feeKobo}), 0)::text`,
      count: count(),
    })
    .from(fundingEvents)
    .where(
      and(eq(fundingEvents.status, "credited"), sql`${fundingEvents.createdAt} >= ${dayStart}`),
    );
  const [userRow] = await db
    .select({
      customers: count(),
      suspended: sql<number>`count(*) filter (where ${users.status} = 'suspended')`.mapWith(Number),
    })
    .from(users)
    .where(eq(users.role, "customer"));
  const [walletRow] = await db
    .select({ total: sql<string>`coalesce(sum(${wallets.balanceKobo}), 0)::text` })
    .from(wallets);
  const [ledgerRow] = await db
    .select({
      total: sql<string>`coalesce(sum(case when ${ledgerEntries.direction} = 'credit'
        then ${ledgerEntries.amountKobo} else -${ledgerEntries.amountKobo} end), 0)::text`,
    })
    .from(ledgerEntries);

  const walletsTotalKobo = koboTotal(walletRow?.total);
  const ledgerTotalKobo = koboTotal(ledgerRow?.total);
  return {
    today: {
      salesKobo: koboTotal(orderRow?.salesKobo),
      successCount: orderRow?.successCount ?? 0,
      failedCount: orderRow?.failedCount ?? 0,
      fundedKobo: koboTotal(fundingRow?.fundedKobo),
      fundingFeesKobo: koboTotal(fundingRow?.feesKobo),
      fundingCount: fundingRow?.count ?? 0,
    },
    pendingCount: orderRow?.pendingCount ?? 0,
    stuckCount: orderRow?.stuckCount ?? 0,
    customerCount: userRow?.customers ?? 0,
    suspendedCount: userRow?.suspended ?? 0,
    walletsTotalKobo,
    ledgerTotalKobo,
    ledgerMatches: walletsTotalKobo === ledgerTotalKobo,
  };
}

const ADMIN_STATUS: Record<AdminErrorCode, number> = {
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  price_below_cost: 409,
  order_not_pending: 409,
};

/** Maps admin errors to HTTP; null for anything else. */
export function adminErrorResponse(error: unknown): ErrorResponse | null {
  if (!(error instanceof AdminError)) return null;
  return {
    status: ADMIN_STATUS[error.code],
    body: { error: { code: error.code, message: error.message } },
  };
}

/**
 * Makes an existing customer an admin (or removes it). Audited with no actor: run from the
 * laptop with `pnpm admin:grant <email or phone>`, never from the web.
 */
export async function setAdminRole(
  db: DbOrTx,
  input: { userId: string; admin: boolean; note: string },
) {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, input.userId)).for("update");
    if (!user) throw new AdminError("not_found", "User not found");
    const role = input.admin ? "admin" : "customer";
    await tx
      .update(users)
      .set({ role, updatedAt: sql`now()` })
      .where(eq(users.id, user.id));
    await tx.insert(auditLog).values({
      actorUserId: null,
      action: input.admin ? "user.grant_admin" : "user.revoke_admin",
      entityType: "user",
      entityId: user.id,
      before: { role: user.role },
      after: { role },
      reason: input.note,
    });
  });
}
