import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { productCategory, userTier } from "./enums.ts";

/** VTU providers. The id is the adapter's name, e.g. "vtpass". */
export const providers = pgTable("providers", {
  id: text().primaryKey(),
  name: text().notNull(),
  isActive: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Something a customer can buy, e.g. "MTN 1GB (30 days)" or "MTN Airtime". */
export const products = pgTable(
  "products",
  {
    id: uuid().primaryKey().defaultRandom(),
    category: productCategory().notNull(),
    /** "mtn", "airtel", "glo" or "9mobile". */
    network: text().notNull(),
    name: text().notNull(),
    /** Which provider sells it. Switchable from admin later. */
    providerId: text()
      .notNull()
      .references(() => providers.id),
    /** The provider's service id, e.g. "mtn-data" or "mtn" (airtime). */
    providerServiceId: text().notNull(),
    /** The provider's plan code for data, e.g. "mtn-10mb-100"; null for airtime. */
    providerVariationCode: text(),
    /** What the provider charges us for a fixed-price plan, in kobo; null for airtime. */
    providerPriceKobo: bigint({ mode: "number" }),
    isActive: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("products_provider_plan_unique")
      .on(t.providerId, t.providerServiceId, t.providerVariationCode)
      .nullsNotDistinct(),
  ],
);

/**
 * Our selling price for a product, per price tier.
 * - Fixed-price products (data plans): `priceKobo` is what the customer pays.
 * - Customer-chosen amounts (airtime): `discountBps` is the discount in basis points
 *   (100 bps = 1%), so ₦1,000 airtime at 200 bps costs the customer ₦980.
 */
export const prices = pgTable(
  "prices",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    tier: userTier().notNull(),
    priceKobo: bigint({ mode: "number" }),
    discountBps: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("prices_product_tier_unique").on(t.productId, t.tier),
    check("prices_exactly_one_kind", sql`(${t.priceKobo} is null) <> (${t.discountBps} is null)`),
    check("prices_price_positive", sql`${t.priceKobo} is null or ${t.priceKobo} > 0`),
    check(
      "prices_discount_range",
      sql`${t.discountBps} is null or (${t.discountBps} >= 0 and ${t.discountBps} < 10000)`,
    ),
  ],
);
