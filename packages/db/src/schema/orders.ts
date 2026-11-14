import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { products, providers } from "./catalog.ts";
import { orderStatus } from "./enums.ts";
import { users, wallets } from "./users.ts";

export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Sent to the provider. Unique: a retry reuses it, so the provider can't deliver twice. */
    requestId: text().notNull().unique(),
    /**
     * Optional id the app generates when the customer taps "Buy". A retry or double-tap with the
     * same id returns the original order instead of charging again. Unique per user.
     */
    clientReference: text(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    walletId: uuid()
      .notNull()
      .references(() => wallets.id),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    /** The provider used for this order (copied, as the product's provider can change later). */
    providerId: text()
      .notNull()
      .references(() => providers.id),
    recipientPhone: text().notNull(),
    /** What the recipient gets, e.g. ₦1,000 of airtime, in kobo. */
    faceValueKobo: bigint({ mode: "number" }).notNull(),
    /** What we debited from the customer's wallet, in kobo. */
    amountKobo: bigint({ mode: "number" }).notNull(),
    status: orderStatus().notNull().default("pending"),
    providerCode: text(),
    /** The provider's human-readable message for the latest reply. */
    providerMessage: text(),
    providerReference: text(),
    /** The provider's latest reply, for logs and disputes. */
    providerResponse: jsonb(),
    /** How many times we've asked the provider about this order. */
    attempts: integer().notNull().default(0),
    lastCheckedAt: timestamp({ withTimezone: true }),
    /** Set when a failed order's money has been returned to the wallet. */
    refundedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("orders_amount_positive", sql`${t.amountKobo} > 0`),
    check("orders_face_value_positive", sql`${t.faceValueKobo} > 0`),
    index("orders_user_created_idx").on(t.userId, t.createdAt),
    uniqueIndex("orders_user_client_reference_unique")
      .on(t.userId, t.clientReference)
      .where(sql`${t.clientReference} is not null`),
    // For the "same number within 15 seconds" check (VTpass code 019).
    index("orders_recipient_created_idx").on(t.recipientPhone, t.createdAt),
    // The re-check job looks for old pending orders.
    index("orders_pending_idx")
      .on(t.createdAt)
      .where(sql`${t.status} = 'pending'`),
  ],
);
