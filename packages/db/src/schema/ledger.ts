import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ledgerDirection, ledgerReason } from "./enums.ts";
import { users, wallets } from "./users.ts";

/**
 * The wallet's statement. Rows are only ever inserted, never updated or deleted.
 * A wallet's balance is the sum of its credits minus its debits.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    walletId: uuid()
      .notNull()
      .references(() => wallets.id),
    direction: ledgerDirection().notNull(),
    /** Always positive; the direction says whether it adds or subtracts. */
    amountKobo: bigint({ mode: "number" }).notNull(),
    /** The wallet balance right after this entry. */
    balanceAfterKobo: bigint({ mode: "number" }).notNull(),
    reason: ledgerReason().notNull(),
    /**
     * What caused this entry, e.g. the order id or funding event id. Together with `reason` it is
     * unique, so one order can only be debited once and refunded once, and one funding event
     * credited once.
     */
    referenceId: text(),
    description: text(),
    /** The admin who made a manual entry, if any. */
    createdBy: uuid().references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ledger_amount_positive", sql`${t.amountKobo} > 0`),
    check("ledger_balance_after_not_negative", sql`${t.balanceAfterKobo} >= 0`),
    uniqueIndex("ledger_reason_reference_unique")
      .on(t.reason, t.referenceId)
      .where(sql`${t.referenceId} is not null`),
    index("ledger_wallet_created_idx").on(t.walletId, t.createdAt),
  ],
);
