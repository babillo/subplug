// What the customer pays, what the recipient gets, and what we send to the provider.
// All integer kobo. Discounts round DOWN, so we never undercharge.
import type { Kobo } from "../money.ts";
import { PurchaseError } from "./errors.ts";

/** Placeholder airtime limits (₦50 – ₦50,000). VTpass rejects below its minimum with code 013. */
export const AIRTIME_MIN_KOBO = 5_000;
export const AIRTIME_MAX_KOBO = 5_000_000;

export interface QuoteProduct {
  category: "airtime" | "data";
  /** The provider's plan price (data); null for airtime. */
  providerPriceKobo: Kobo | null;
}

export interface QuotePrice {
  priceKobo: Kobo | null;
  discountBps: number | null;
}

export interface Quote {
  /** Debited from the customer's wallet. */
  amountKobo: Kobo;
  /** What the recipient gets. */
  faceValueKobo: Kobo;
  /** Sent to the provider as the amount (must be whole naira for VTpass). */
  providerAmountKobo: Kobo;
}

export function quote(product: QuoteProduct, price: QuotePrice, faceValueKobo?: Kobo): Quote {
  if (product.category === "data") {
    if (price.priceKobo === null || product.providerPriceKobo === null) {
      throw new PurchaseError("price_missing", "This plan has no price set yet");
    }
    return {
      amountKobo: price.priceKobo,
      faceValueKobo: product.providerPriceKobo,
      providerAmountKobo: product.providerPriceKobo,
    };
  }

  if (price.discountBps === null) {
    throw new PurchaseError("price_missing", "This product has no price set yet");
  }
  if (
    faceValueKobo === undefined ||
    !Number.isSafeInteger(faceValueKobo) ||
    faceValueKobo < AIRTIME_MIN_KOBO ||
    faceValueKobo > AIRTIME_MAX_KOBO ||
    faceValueKobo % 100 !== 0
  ) {
    throw new PurchaseError(
      "invalid_amount",
      `Enter a whole naira amount between ₦${AIRTIME_MIN_KOBO / 100} and ₦${(AIRTIME_MAX_KOBO / 100).toLocaleString("en-NG")}`,
    );
  }
  // Integer maths: discount in kobo, rounded down.
  const discountKobo = Math.floor((faceValueKobo * price.discountBps) / 10_000);
  return {
    amountKobo: faceValueKobo - discountKobo,
    faceValueKobo,
    providerAmountKobo: faceValueKobo,
  };
}
