// The JSON the API sends back, shared by the web screens and the mobile app.
// Money is always integer kobo; dates are ISO strings.

export interface ApiUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  tier: "regular" | "reseller";
  hasPin: boolean;
  pinLocked: boolean;
}

/** A product the signed-in customer can buy, at their own price. */
export interface CatalogItem {
  id: string;
  category: "airtime" | "data";
  network: string;
  name: string;
  /** Data: what the customer pays. Null for airtime. */
  priceKobo: number | null;
  /** Airtime: the customer's discount in basis points (100 = 1%). Null for data. */
  discountBps: number | null;
  /** Data: the plan's face value. Null for airtime. */
  faceValueKobo: number | null;
}

export type OrderStatus = "pending" | "success" | "failed";

export interface OrderSummary {
  id: string;
  status: OrderStatus;
  productId: string;
  productName: string;
  category: "airtime" | "data";
  network: string;
  recipientPhone: string;
  amountKobo: number;
  faceValueKobo: number;
  createdAt: string;
  refundedAt: string | null;
  /** A plain-words line about this order for the customer. */
  message: string;
}

export interface StatementEntry {
  id: string;
  direction: "credit" | "debit";
  amountKobo: number;
  balanceAfterKobo: number;
  reason: string;
  description: string | null;
  createdAt: string;
}

export interface FundingAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

/** POST /api/orders */
export interface OrderResult {
  order: { status: OrderStatus };
  message: string;
}

/** POST /api/auth/sign-in */
export type SignInResult =
  { status: "profile_required" } | { status: "signed_in"; user: ApiUser; token?: string };

/** The error body every API route uses. */
export interface ApiErrorBody {
  code?: string;
  message?: string;
  fields?: Record<string, string>;
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
}
