// What a signed-in customer can see. Every query is scoped to the customer's own user id, and only
// customer-safe fields are returned (never provider costs, plan codes, raw provider replies,
// internal references or who made an admin entry).
import { type DbOrTx, schema } from "@repo/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { Kobo } from "../money.ts";
import { customerMessage } from "../orders/http.ts";

const { ledgerEntries, orders, prices, products, providers, users, wallets } = schema;

export interface Page {
  limit?: number;
  offset?: number;
}

/** Clamps paging to sensible bounds (1–100 per page). */
export function pageOf(page: Page = {}): { limit: number; offset: number } {
  const limit = Math.min(100, Math.max(1, Math.floor(page.limit ?? 20)));
  const offset = Math.max(0, Math.floor(page.offset ?? 0));
  return { limit, offset };
}

export interface CatalogItem {
  id: string;
  category: "airtime" | "data";
  network: string;
  name: string;
  /** Data: what the customer pays. Null for airtime. */
  priceKobo: Kobo | null;
  /** Airtime: the customer's discount in basis points (100 = 1%). Null for data. */
  discountBps: number | null;
  /** Data: the plan's face value. Null for airtime (the customer picks the amount). */
  faceValueKobo: Kobo | null;
}

/** Products the customer can buy right now, at their own tier price (regular as fallback). */
export async function listProductsForUser(db: DbOrTx, userId: string): Promise<CatalogItem[]> {
  const [user] = await db.select({ tier: users.tier }).from(users).where(eq(users.id, userId));
  if (!user) return [];

  const rows = await db
    .select({ product: products, price: prices })
    .from(products)
    .innerJoin(providers, eq(providers.id, products.providerId))
    .innerJoin(prices, eq(prices.productId, products.id))
    .where(
      and(
        eq(products.isActive, true),
        eq(providers.isActive, true),
        inArray(prices.tier, [user.tier, "regular"]),
      ),
    )
    .orderBy(
      asc(products.network),
      asc(products.category),
      asc(products.providerPriceKobo),
      asc(products.name),
    );

  const byProduct = new Map<string, CatalogItem & { tier: string }>();
  for (const { product, price } of rows) {
    const existing = byProduct.get(product.id);
    // Keep the user's own tier price over the regular one.
    if (existing && existing.tier === user.tier) continue;
    byProduct.set(product.id, {
      id: product.id,
      category: product.category,
      network: product.network,
      name: product.name,
      priceKobo: product.category === "data" ? price.priceKobo : null,
      discountBps: product.category === "airtime" ? price.discountBps : null,
      faceValueKobo: product.category === "data" ? product.providerPriceKobo : null,
      tier: price.tier,
    });
  }
  return [...byProduct.values()]
    .filter((p) =>
      p.category === "data"
        ? p.priceKobo !== null && p.faceValueKobo !== null
        : p.discountBps !== null,
    )
    .map(({ tier: _tier, ...item }) => item);
}

export interface StatementEntry {
  id: string;
  direction: "credit" | "debit";
  amountKobo: Kobo;
  balanceAfterKobo: Kobo;
  reason: string;
  description: string | null;
  createdAt: string;
}

/** The customer's balance and statement, newest first. */
export async function getWalletStatement(
  db: DbOrTx,
  userId: string,
  page: Page = {},
): Promise<{ balanceKobo: Kobo; entries: StatementEntry[]; hasMore: boolean }> {
  const { limit, offset } = pageOf(page);
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  if (!wallet) return { balanceKobo: 0, entries: [], hasMore: false };

  const rows = await db
    .select({
      id: ledgerEntries.id,
      direction: ledgerEntries.direction,
      amountKobo: ledgerEntries.amountKobo,
      balanceAfterKobo: ledgerEntries.balanceAfterKobo,
      reason: ledgerEntries.reason,
      description: ledgerEntries.description,
      createdAt: ledgerEntries.createdAt,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.walletId, wallet.id))
    .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
    .limit(limit + 1)
    .offset(offset);

  return {
    balanceKobo: wallet.balanceKobo,
    entries: rows.slice(0, limit).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    hasMore: rows.length > limit,
  };
}

export interface OrderSummary {
  id: string;
  status: "pending" | "success" | "failed";
  productId: string;
  productName: string;
  category: "airtime" | "data";
  network: string;
  recipientPhone: string;
  amountKobo: Kobo;
  faceValueKobo: Kobo;
  createdAt: string;
  refundedAt: string | null;
  /** A plain-words line about this order for the customer. */
  message: string;
}

const orderSummaryColumns = {
  id: orders.id,
  status: orders.status,
  productId: orders.productId,
  productName: products.name,
  category: products.category,
  network: products.network,
  recipientPhone: orders.recipientPhone,
  amountKobo: orders.amountKobo,
  faceValueKobo: orders.faceValueKobo,
  providerCode: orders.providerCode,
  createdAt: orders.createdAt,
  refundedAt: orders.refundedAt,
};

type OrderSummaryRow = Omit<OrderSummary, "createdAt" | "refundedAt" | "message"> & {
  providerCode: string | null;
  createdAt: Date;
  refundedAt: Date | null;
};

function toSummary(row: OrderSummaryRow): OrderSummary {
  const { providerCode: _providerCode, createdAt, refundedAt, ...rest } = row;
  return {
    ...rest,
    createdAt: createdAt.toISOString(),
    refundedAt: refundedAt?.toISOString() ?? null,
    message: customerMessage(row),
  };
}

/** The customer's orders, newest first, optionally only one status. */
export async function listUserOrders(
  db: DbOrTx,
  userId: string,
  options: Page & { status?: "pending" | "success" | "failed" } = {},
): Promise<{ orders: OrderSummary[]; hasMore: boolean }> {
  const { limit, offset } = pageOf(options);
  const rows = await db
    .select(orderSummaryColumns)
    .from(orders)
    .innerJoin(products, eq(products.id, orders.productId))
    .where(
      and(
        eq(orders.userId, userId),
        options.status ? eq(orders.status, options.status) : undefined,
      ),
    )
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(limit + 1)
    .offset(offset);
  return { orders: rows.slice(0, limit).map(toSummary), hasMore: rows.length > limit };
}

/** One order, only if it belongs to this customer. */
export async function getUserOrder(
  db: DbOrTx,
  userId: string,
  orderId: string,
): Promise<OrderSummary | null> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const [row] = await db
    .select(orderSummaryColumns)
    .from(orders)
    .innerJoin(products, eq(products.id, orders.productId))
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
  return row ? toSummary(row) : null;
}
