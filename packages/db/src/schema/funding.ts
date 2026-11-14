import { sql } from "drizzle-orm";
import { bigint, check, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { fundingStatus } from "./enums.ts";
import { wallets } from "./users.ts";

/** Money arriving from a payment gateway (Monnify/Paystack). One row per gateway payment. */
export const fundingEvents = pgTable(
  "funding_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    walletId: uuid()
      .notNull()
      .references(() => wallets.id),
    /** e.g. "monnify" or "paystack". */
    gateway: text().notNull(),
    /** The gateway's own reference for the payment. Unique per gateway: never credited twice. */
    gatewayReference: text().notNull(),
    amountKobo: bigint({ mode: "number" }).notNull(),
    status: fundingStatus().notNull(),
    /** The gateway's payload, for audits and disputes. */
    raw: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("funding_gateway_reference_unique").on(t.gateway, t.gatewayReference),
    check("funding_amount_positive", sql`${t.amountKobo} > 0`),
  ],
);
