// The purchase flow. Three steps, so the wallet lock is never held while waiting for the provider:
//
// 1. placeOrder  (one DB transaction): validate, price, create the order as `pending`, debit the
//    wallet (row lock), commit. Not enough money → nothing is written at all.
// 2. send        (no transaction): ask the provider to deliver, using the order's request_id.
// 3. settleOrder (one DB transaction): lock the order row; if it's still pending, record the
//    result; on `failed`, refund with a credit ledger entry. Already-settled orders are left alone,
//    so the purchase and the re-check job can never refund twice.
//
// If the process dies between 1 and 2, the order stays pending; the re-check job requeries it,
// the provider says it never received it (VTpass 015 → failed), and the customer is refunded.
import { type DbOrTx, schema } from "@repo/db";
import { normaliseNigerianPhone } from "@repo/shared/orders";
import { and, eq, inArray, sql } from "drizzle-orm";

import { isUniqueViolation } from "../db-errors.ts";
import type { Kobo } from "../money.ts";
import type { ProviderAdapter, PurchaseOrder, PurchaseResult } from "../providers/types.ts";
import { generateRequestId } from "../providers/vtpass/request-id.ts";
import { credit, debit } from "../wallet/wallet.ts";
import { PurchaseError, RecentPurchaseError } from "./errors.ts";
import { quote } from "./pricing.ts";

const { orders, prices, products, providers, users, wallets } = schema;

export type Order = typeof orders.$inferSelect;

/** Finds the adapter for a provider id stored on a product/order, e.g. "vtpass". */
export type GetProvider = (providerId: string) => ProviderAdapter;

export interface BuyInput {
  userId: string;
  productId: string;
  recipientPhone: string;
  /** Airtime only: how much airtime, in kobo. */
  faceValueKobo?: Kobo;
  /** Id the app generates per "Buy" tap; a repeat returns the original order. */
  clientReference?: string;
  /** The customer's 4-digit transaction PIN (CLAUDE.md rule 8). Checked before anything else. */
  pin: string;
}

export interface BuyResult {
  order: Order;
  /** true when this clientReference was already used: nothing was charged this time. */
  duplicate: boolean;
}

/** VTpass rejects any new purchase to the same number within 15 seconds (code 019). */
const SAME_RECIPIENT_GAP_SECONDS = 16;

export function createPurchaseService(deps: {
  db: DbOrTx;
  getProvider: GetProvider;
  /** Throws (wrong_pin, pin_locked, pin_not_set) unless the PIN is right: auth service's verifyPin. */
  verifyPin: (userId: string, pin: string) => Promise<void>;
}) {
  return {
    async buy(input: BuyInput): Promise<BuyResult> {
      // The PIN comes first: a wrong or locked PIN means no order, no debit, no provider call.
      await deps.verifyPin(input.userId, input.pin);
      const placed = await reserve(deps.db, input);
      if (placed.duplicate) return { order: placed.order, duplicate: true };

      const result = await send(deps.getProvider, placed.order, placed.request);
      const { order } = await settleOrder(deps.db, placed.order.id, result);
      return { order, duplicate: false };
    },
  };
}

/**
 * Step 1 only: charge the wallet and create the pending order. Exposed for tests and recovery;
 * it does NOT check the PIN, so app code must go through createPurchaseService().buy().
 */
export async function placeOrder(db: DbOrTx, input: Omit<BuyInput, "pin">): Promise<Order> {
  return (await reserve(db, input)).order;
}

export interface SettleResult {
  order: Order;
  /** true when this call moved the order out of `pending`. */
  changed: boolean;
}

/** Step 3: records a provider result on a pending order, refunding on failure. Safe to repeat. */
export async function settleOrder(
  db: DbOrTx,
  orderId: string,
  result: PurchaseResult,
): Promise<SettleResult> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new Error(`Order ${orderId} does not exist`);
    if (order.status !== "pending") return { order, changed: false };

    const recorded = {
      providerCode: result.providerCode,
      providerMessage: result.message,
      providerResponse: result.raw ?? null,
      providerReference: result.providerReference ?? order.providerReference,
      attempts: order.attempts + 1,
      lastCheckedAt: sql`now()`,
      updatedAt: sql`now()`,
    };

    if (result.status === "pending") {
      const [updated] = await tx
        .update(orders)
        .set(recorded)
        .where(eq(orders.id, orderId))
        .returning();
      return { order: updated!, changed: false };
    }

    if (result.status === "failed") {
      await credit(tx, {
        walletId: order.walletId,
        amountKobo: order.amountKobo,
        reason: "refund",
        referenceId: order.id,
        // Plain words for the customer's statement; the provider's own message is kept on the
        // order (providerMessage) for admins.
        description: `Refund: purchase for ${order.recipientPhone} didn’t go through`,
      });
    }

    const [updated] = await tx
      .update(orders)
      .set({
        ...recorded,
        status: result.status,
        ...(result.status === "failed" ? { refundedAt: sql`now()` } : {}),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return { order: updated!, changed: true };
  });
}

// ---------------------------------------------------------------------------------------------

interface Reservation {
  order: Order;
  duplicate: boolean;
  /** What to send to the provider (only for new orders). */
  request: PurchaseOrder;
}

async function findByClientReference(db: DbOrTx, userId: string, clientReference: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.clientReference, clientReference)));
  return order;
}

function duplicateOf(order: Order): Reservation {
  return { order, duplicate: true, request: undefined as never };
}

async function reserve(db: DbOrTx, input: Omit<BuyInput, "pin">): Promise<Reservation> {
  const recipientPhone = normaliseNigerianPhone(input.recipientPhone);
  if (!recipientPhone) {
    throw new PurchaseError("invalid_phone", "Enter a valid Nigerian phone number");
  }

  // A repeated tap: hand back the original order without charging again.
  if (input.clientReference) {
    const existing = await findByClientReference(db, input.userId, input.clientReference);
    if (existing) return duplicateOf(existing);
  }

  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, input.userId));
      if (!user) throw new PurchaseError("user_not_found", "Account not found");
      if (user.status !== "active") {
        throw new PurchaseError("user_suspended", "This account can't make purchases right now");
      }
      // Lock the customer's wallet first. Every purchase by this customer now takes its turn here,
      // so a repeated tap always sees the first order, and two purchases can't deadlock later on.
      const [wallet] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, user.id))
        .for("update");
      if (!wallet) throw new PurchaseError("user_not_found", "Wallet not found");

      // Checked again under the lock: an identical tap may have finished while we waited.
      if (input.clientReference) {
        const existing = await findByClientReference(tx, user.id, input.clientReference);
        if (existing) return duplicateOf(existing);
      }

      const [row] = await tx
        .select({ product: products, providerActive: providers.isActive })
        .from(products)
        .innerJoin(providers, eq(providers.id, products.providerId))
        .where(eq(products.id, input.productId));
      if (!row) throw new PurchaseError("product_not_found", "Product not found");
      const { product } = row;
      if (!product.isActive || !row.providerActive) {
        throw new PurchaseError("product_unavailable", "This product isn't available right now");
      }

      // The user's tier price, falling back to the regular price.
      const tierPrices = await tx
        .select()
        .from(prices)
        .where(and(eq(prices.productId, product.id), inArray(prices.tier, [user.tier, "regular"])));
      const price =
        tierPrices.find((p) => p.tier === user.tier) ??
        tierPrices.find((p) => p.tier === "regular");
      if (!price) throw new PurchaseError("price_missing", "This product has no price set yet");
      const q = quote(product, price, input.faceValueKobo);

      // VTpass's 15-second rule: refuse now rather than charge, fail (019) and refund.
      const [recent] = await tx
        .select({
          ageSeconds: sql<string>`extract(epoch from now() - max(${orders.createdAt}))::text`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.recipientPhone, recipientPhone),
            sql`${orders.createdAt} > now() - make_interval(secs => ${SAME_RECIPIENT_GAP_SECONDS})`,
          ),
        );
      if (recent?.ageSeconds != null) {
        const waitSeconds = Math.max(
          1,
          Math.ceil(SAME_RECIPIENT_GAP_SECONDS - Number(recent.ageSeconds)),
        );
        throw new RecentPurchaseError(waitSeconds);
      }

      const [order] = await tx
        .insert(orders)
        .values({
          requestId: generateRequestId(),
          clientReference: input.clientReference ?? null,
          userId: user.id,
          walletId: wallet.id,
          productId: product.id,
          providerId: product.providerId,
          recipientPhone,
          faceValueKobo: q.faceValueKobo,
          amountKobo: q.amountKobo,
          status: "pending",
        })
        .returning();

      // Lock the wallet, check the balance, debit. Not enough money → InsufficientFundsError,
      // and this whole transaction (including the order above) is rolled back.
      await debit(tx, {
        walletId: wallet.id,
        amountKobo: q.amountKobo,
        reason: "purchase",
        referenceId: order!.id,
        description: `${product.name} for ${recipientPhone}`,
      });

      return {
        order: order!,
        duplicate: false,
        request: {
          requestId: order!.requestId,
          serviceId: product.providerServiceId,
          recipientPhone,
          amountKobo: q.providerAmountKobo,
          ...(product.providerVariationCode
            ? { variationCode: product.providerVariationCode }
            : {}),
        },
      };
    });
  } catch (error) {
    // Two identical taps at the same moment: the database let only one order in.
    if (input.clientReference && isUniqueViolation(error)) {
      const existing = await findByClientReference(db, input.userId, input.clientReference);
      if (existing) return duplicateOf(existing);
    }
    throw error;
  }
}

/** Step 2: ask the provider. Adapters never throw for network/provider problems (those come back
 * as pending/failed); they only throw when refusing an order before sending it, which is a safe
 * failure to refund. */
async function send(
  getProvider: GetProvider,
  order: Order,
  request: PurchaseOrder,
): Promise<PurchaseResult> {
  try {
    return await getProvider(order.providerId).purchase(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      requestId: order.requestId,
      providerCode: null,
      message: `Not sent to provider: ${message}`,
      providerReference: null,
      providerAmountKobo: null,
      raw: { error: "not_sent", message },
    };
  }
}
