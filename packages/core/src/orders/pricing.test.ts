import { describe, expect, it } from "vitest";

import { PurchaseError } from "./errors.ts";
import { AIRTIME_MAX_KOBO, AIRTIME_MIN_KOBO, quote } from "./pricing.ts";

const dataProduct = { category: "data" as const, providerPriceKobo: 100_000 };
const airtime = { category: "airtime" as const, providerPriceKobo: null };

describe("quote: data plans (fixed price)", () => {
  it("charges the tier price; the provider gets its own plan price", () => {
    expect(quote(dataProduct, { priceKobo: 99_000, discountBps: null })).toEqual({
      amountKobo: 99_000,
      faceValueKobo: 100_000,
      providerAmountKobo: 100_000,
    });
  });

  it("ignores an amount sent for a fixed-price plan", () => {
    expect(quote(dataProduct, { priceKobo: 99_000, discountBps: null }, 5_000).amountKobo).toBe(
      99_000,
    );
  });

  it("refuses a data product with no price set", () => {
    expect(() => quote(dataProduct, { priceKobo: null, discountBps: 100 })).toThrow(PurchaseError);
    expect(() =>
      quote({ ...dataProduct, providerPriceKobo: null }, { priceKobo: 1, discountBps: null }),
    ).toThrow(PurchaseError);
  });
});

describe("quote: airtime (customer picks the amount)", () => {
  it("charges the amount minus the tier discount", () => {
    expect(quote(airtime, { priceKobo: null, discountBps: 100 }, 100_000)).toEqual({
      amountKobo: 99_000, // ₦1,000 airtime at 1% off = ₦990
      faceValueKobo: 100_000,
      providerAmountKobo: 100_000,
    });
    expect(quote(airtime, { priceKobo: null, discountBps: 250 }, 100_000).amountKobo).toBe(97_500);
  });

  it("rounds the discount down, so we never undercharge", () => {
    // ₦55 at 2.5% = 137.5 kobo off → 137 off → pay 5,363 kobo
    expect(quote(airtime, { priceKobo: null, discountBps: 250 }, 5_500).amountKobo).toBe(5_363);
  });

  it("charges full price with no discount", () => {
    expect(quote(airtime, { priceKobo: null, discountBps: 0 }, 5_000).amountKobo).toBe(5_000);
  });

  it.each([
    ["missing", undefined],
    ["below the minimum", AIRTIME_MIN_KOBO - 100],
    ["above the maximum", AIRTIME_MAX_KOBO + 100],
    ["not whole naira", 10_050],
  ])("refuses an amount that is %s", (_label, faceValueKobo) => {
    const error = (() => {
      try {
        quote(airtime, { priceKobo: null, discountBps: 100 }, faceValueKobo);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(PurchaseError);
    expect((error as PurchaseError).code).toBe("invalid_amount");
  });

  it("accepts the minimum and maximum exactly", () => {
    expect(() =>
      quote(airtime, { priceKobo: null, discountBps: 100 }, AIRTIME_MIN_KOBO),
    ).not.toThrow();
    expect(() =>
      quote(airtime, { priceKobo: null, discountBps: 100 }, AIRTIME_MAX_KOBO),
    ).not.toThrow();
  });
});
