import { sql } from "drizzle-orm";
import { bigint, check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { userStatus, userTier } from "./enums.ts";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  fullName: text().notNull(),
  /** Lower-case email; unique when present. Needed for funding accounts (Monnify). */
  email: text().unique(),
  /** Nigerian mobile number as 0XXXXXXXXXX; unique when present. */
  phone: text().unique(),
  /** Set when the customer proves they own it with a one-time code. */
  phoneVerifiedAt: timestamp({ withTimezone: true }),
  emailVerifiedAt: timestamp({ withTimezone: true }),
  tier: userTier().notNull().default("regular"),
  status: userStatus().notNull().default("active"),
  /** bcrypt hash of the 4-digit transaction PIN. Null until the customer sets one. */
  pinHash: text(),
  /** Wrong PINs in a row. Reset to 0 by a correct PIN or a PIN reset. */
  pinFailedAttempts: integer().notNull().default(0),
  /** Set after 5 wrong PINs: purchases are blocked until the PIN is reset with a one-time code. */
  pinLockedAt: timestamp({ withTimezone: true }),
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
