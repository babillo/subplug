// Turns purchase results and errors into HTTP responses for the API (web now, mobile later).
// Only customer-safe fields leave the server: never the provider's raw response.
import { formatNaira } from "../money.ts";
import { InsufficientFundsError, ReferenceConflictError } from "../wallet/wallet.ts";
import { PurchaseError, type PurchaseErrorCode, RecentPurchaseError } from "./errors.ts";
import type { Order } from "./purchase.ts";

export interface OrderView {
  id: string;
  status: Order["status"];
  productId: string;
  recipientPhone: string;
  amountKobo: number;
  faceValueKobo: number;
  createdAt: string;
  refundedAt: string | null;
}

export interface OrderResponseBody {
  order: OrderView;
  duplicate: boolean;
  /** A plain-words line for the customer. */
  message: string;
}

/** A plain-words line for the customer about an order. */
export function customerMessage(
  order: Pick<Order, "status" | "providerCode" | "amountKobo">,
): string {
  if (order.status === "success") return "Purchase successful.";
  if (order.status === "pending") {
    return "Your purchase is processing. We'll update it shortly; if it fails, you'll be refunded automatically.";
  }
  if (order.providerCode === "019") {
    return `This number just received a top-up, so the network declined a repeat. Your ${formatNaira(order.amountKobo)} has been refunded. Please wait 15 seconds and try again.`;
  }
  return `The purchase didn't go through. Your ${formatNaira(order.amountKobo)} has been refunded to your wallet.`;
}

export function orderResponse(
  order: Order,
  duplicate: boolean,
): { status: number; body: OrderResponseBody } {
  return {
    status: duplicate ? 200 : 201,
    body: {
      order: {
        id: order.id,
        status: order.status,
        productId: order.productId,
        recipientPhone: order.recipientPhone,
        amountKobo: order.amountKobo,
        faceValueKobo: order.faceValueKobo,
        createdAt: order.createdAt.toISOString(),
        refundedAt: order.refundedAt?.toISOString() ?? null,
      },
      duplicate,
      message: customerMessage(order),
    },
  };
}

export interface ErrorResponse {
  status: number;
  headers?: Record<string, string>;
  body: { error: { code: string; message: string; retryAfterSeconds?: number } };
}

const STATUS_BY_CODE: Record<PurchaseErrorCode, number> = {
  invalid_phone: 400,
  invalid_amount: 400,
  user_not_found: 404,
  user_suspended: 403,
  product_not_found: 404,
  product_unavailable: 409,
  price_missing: 409,
  recent_purchase: 429,
};

/** Maps known purchase errors to HTTP. Returns null for unexpected ones (answer 500 and log). */
export function purchaseErrorResponse(error: unknown): ErrorResponse | null {
  if (error instanceof RecentPurchaseError) {
    return {
      status: 429,
      headers: { "Retry-After": String(error.retryAfterSeconds) },
      body: {
        error: {
          code: error.code,
          message: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
        },
      },
    };
  }
  if (error instanceof PurchaseError) {
    return {
      status: STATUS_BY_CODE[error.code],
      body: { error: { code: error.code, message: error.message } },
    };
  }
  if (error instanceof InsufficientFundsError) {
    return {
      status: 402,
      body: {
        error: {
          code: "insufficient_funds",
          message: `Your wallet balance (${formatNaira(error.balanceKobo)}) is too low for this purchase (${formatNaira(error.requestedKobo)}). Please fund your wallet.`,
        },
      },
    };
  }
  if (error instanceof ReferenceConflictError) {
    return {
      status: 409,
      body: { error: { code: "conflict", message: "This request conflicts with an earlier one." } },
    };
  }
  return null;
}
