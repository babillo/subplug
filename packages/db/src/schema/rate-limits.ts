import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Request counters for rate limits: one row per (what is being limited, time window).
 * e.g. key "otp:ip:203.0.113.5", window starting 10:00 → count 7. Old rows are deleted by the
 * clean-up job; nothing else refers to this table.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text().notNull(),
    windowStart: timestamp({ withTimezone: true }).notNull(),
    count: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
