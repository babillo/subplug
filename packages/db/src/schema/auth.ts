import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { otpChannel, otpPurpose } from "./enums.ts";
import { users } from "./users.ts";

/**
 * One-time codes for signing in and resetting the PIN. Only a keyed hash of the code is stored,
 * never the code itself. A code dies after 10 minutes, after 5 wrong tries, or once used.
 */
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid().primaryKey().defaultRandom(),
    channel: otpChannel().notNull(),
    /** Normalised phone (0XXXXXXXXXX) or lower-case email. */
    destination: text().notNull(),
    purpose: otpPurpose().notNull(),
    /** HMAC-SHA256 of the code with AUTH_SECRET. */
    codeHash: text().notNull(),
    attempts: integer().notNull().default(0),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("otp_destination_purpose_idx").on(t.destination, t.purpose, t.createdAt)],
);

/**
 * Signed-in sessions. The customer holds a random token (web: secure cookie; mobile: header);
 * we store only its SHA-256 hash, so a database leak doesn't hand out working sessions.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);
