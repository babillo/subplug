// The re-check job: finds orders still pending after a couple of minutes, asks the provider what
// happened, and settles them (success, or failed → refund). Safe to run as often as you like and
// to run twice at once: settleOrder only ever changes a pending order, once.
//
// Orders pending for over 24 hours are listed for a human instead of being refunded automatically,
// because some provider answers (e.g. VTpass 044 "contact VTpass") need a person to check.
import { type DbOrTx, schema } from "@repo/db";
import { and, asc, eq, sql } from "drizzle-orm";

import { type GetProvider, settleOrder } from "./purchase.ts";

const { orders } = schema;

export interface RecheckOptions {
  db: DbOrTx;
  getProvider: GetProvider;
  /** Only check orders at least this old. Default 120 (2 minutes). */
  olderThanSeconds?: number;
  /** Report orders pending longer than this for a human. Default 86,400 (24 hours). */
  staleAfterSeconds?: number;
  /** Most orders to check per run. Default 100. */
  limit?: number;
  /** Where to report per-order problems. Default console.error. */
  log?: (message: string) => void;
}

export interface StaleOrder {
  orderId: string;
  requestId: string;
  ageHours: number;
  lastProviderCode: string | null;
  lastProviderMessage: string | null;
}

export interface RecheckSummary {
  checked: number;
  succeeded: number;
  failed: number;
  stillPending: number;
  errors: number;
  stale: StaleOrder[];
}

export async function recheckPendingOrders(options: RecheckOptions): Promise<RecheckSummary> {
  const {
    db,
    getProvider,
    olderThanSeconds = 120,
    staleAfterSeconds = 86_400,
    limit = 100,
    log = console.error,
  } = options;

  const due = await db
    .select({
      id: orders.id,
      requestId: orders.requestId,
      providerId: orders.providerId,
      ageSeconds: sql<string>`extract(epoch from now() - ${orders.createdAt})::text`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, "pending"),
        sql`${orders.createdAt} < now() - make_interval(secs => ${olderThanSeconds})`,
      ),
    )
    .orderBy(asc(orders.createdAt))
    .limit(limit);

  const summary: RecheckSummary = {
    checked: 0,
    succeeded: 0,
    failed: 0,
    stillPending: 0,
    errors: 0,
    stale: [],
  };

  for (const due_ of due) {
    summary.checked++;
    const ageSeconds = Number(due_.ageSeconds);
    let stillPending = true;
    try {
      const result = await getProvider(due_.providerId).requery(due_.requestId);
      const { order } = await settleOrder(db, due_.id, result);
      if (order.status === "success") summary.succeeded++;
      else if (order.status === "failed") summary.failed++;
      else summary.stillPending++;
      stillPending = order.status === "pending";
      if (stillPending && ageSeconds > staleAfterSeconds) {
        summary.stale.push({
          orderId: order.id,
          requestId: order.requestId,
          ageHours: Math.floor(ageSeconds / 3600),
          lastProviderCode: order.providerCode,
          lastProviderMessage: order.providerMessage,
        });
      }
    } catch (error) {
      summary.errors++;
      log(
        `Re-check of order ${due_.id} (${due_.requestId}) failed: ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }
  return summary;
}
