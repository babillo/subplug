import { pgEnum } from "drizzle-orm/pg-core";

/** Price tier a user buys at. */
export const userTier = pgEnum("user_tier", ["regular", "reseller"]);

export const userStatus = pgEnum("user_status", ["active", "suspended"]);

export const ledgerDirection = pgEnum("ledger_direction", ["credit", "debit"]);

/** Why money moved. Every ledger entry has exactly one reason. */
export const ledgerReason = pgEnum("ledger_reason", [
  "funding", // money in from a payment gateway (bank transfer / card)
  "purchase", // money out for an order
  "refund", // money back for a failed order
  "admin_credit", // manual credit by an admin (audited)
  "admin_debit", // manual debit by an admin (audited)
  "seed", // test data in development only
]);

export const fundingStatus = pgEnum("funding_status", ["credited", "rejected"]);

export const productCategory = pgEnum("product_category", ["airtime", "data"]);

export const orderStatus = pgEnum("order_status", ["pending", "success", "failed"]);
