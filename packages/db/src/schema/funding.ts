import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { fundingStatus } from "./enums.ts";
import { users, wallets } from "./users.ts";

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
    /** What the customer sent (gross), in kobo. */
    amountKobo: bigint({ mode: "number" }).notNull(),
    /** Our funding fee, in kobo. The wallet is credited amountKobo − feeKobo. */
    feeKobo: bigint({ mode: "number" }).notNull().default(0),
    status: fundingStatus().notNull(),
    /** The gateway's payload, for audits and disputes. */
    raw: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("funding_gateway_reference_unique").on(t.gateway, t.gatewayReference),
    check("funding_amount_positive", sql`${t.amountKobo} > 0`),
    check(
      "funding_fee_valid",
      sql`${t.feeKobo} >= 0 and (${t.feeKobo} = 0 or ${t.feeKobo} < ${t.amountKobo})`,
    ),
  ],
);

/**
 * Bank accounts customers pay into to fund their wallet (Monnify reserved accounts, later
 * Paystack dedicated accounts). One row per bank account number; a customer can have several
 * (one per partner bank). The customer's BVN/NIN is sent to the gateway but never stored here.
 */
export const fundingAccounts = pgTable(
  "funding_accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    /** e.g. "monnify". */
    gateway: text().notNull(),
    /** Our reference for the account at the gateway (the user's id), sent back on payments. */
    accountReference: text().notNull(),
    bankCode: text().notNull(),
    bankName: text().notNull(),
    accountNumber: text().notNull(),
    accountName: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("funding_accounts_gateway_bank_account_unique").on(
      t.gateway,
      t.bankCode,
      t.accountNumber,
    ),
    index("funding_accounts_reference_idx").on(t.gateway, t.accountReference),
    index("funding_accounts_user_idx").on(t.userId),
  ],
);
