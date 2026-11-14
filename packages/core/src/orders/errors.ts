// Errors the purchase flow can raise before any money moves. Each has a stable `code` the API
// turns into an HTTP status and a customer-friendly message.

export type PurchaseErrorCode =
  | "invalid_phone"
  | "invalid_amount"
  | "user_not_found"
  | "user_suspended"
  | "product_not_found"
  | "product_unavailable"
  | "price_missing"
  | "recent_purchase";

export class PurchaseError extends Error {
  readonly code: PurchaseErrorCode;
  constructor(code: PurchaseErrorCode, message: string) {
    super(message);
    this.name = "PurchaseError";
    this.code = code;
  }
}

/** VTpass refuses a new purchase to the same number within 15 seconds (code 019). */
export class RecentPurchaseError extends PurchaseError {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(
      "recent_purchase",
      `This number just received a top-up. Please wait ${retryAfterSeconds} seconds and try again.`,
    );
    this.name = "RecentPurchaseError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
