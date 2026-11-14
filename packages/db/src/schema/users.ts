import { sql } from "drizzle-orm";
import { bigint, check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { userStatus, userTier } from "./enums.ts";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  fullName: text().notNull(),
  // Login details arrive with auth (roadmap step 5); unique when present.
  email: text().unique(),
  phone: text().unique(),
  tier: userTier().notNull().default("regular"),
  status: userStatus().notNull().default("active"),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const wallets = pgTable(
  "wallets",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .unique()
      .references(() => users.id),
    /**
     * A cached copy of the sum of this wallet's ledger entries, in kobo. Only the wallet service
     * changes it, in the same transaction as the ledger insert. Never UPDATE it anywhere else.
     */
    balanceKobo: bigint({ mode: "number" }).notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Last line of defence: even buggy code can't push a wallet below zero.
    check("wallets_balance_not_negative", sql`${t.balanceKobo} >= 0`),
  ],
);
