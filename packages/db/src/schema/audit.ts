import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./users.ts";

/** Every admin action (manual credit/debit, price change, refund) with before/after values. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** The admin (or null for the system, e.g. the re-check job). */
    actorUserId: uuid().references(() => users.id),
    /** e.g. "wallet.admin_credit", "price.update", "order.refund". */
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    before: jsonb(),
    after: jsonb(),
    /** Why the admin did it. */
    reason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId)],
);
