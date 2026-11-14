import { describe, expect, it } from "vitest";

import { airtimeCostKobo, normaliseNigerianPhone, parseCreateOrderRequest } from "./orders.ts";

describe("normaliseNigerianPhone", () => {
  it.each([
    ["08011111111", "08011111111"],
    ["0801 111 1111", "08011111111"],
    ["0801-111-1111", "08011111111"],
    ["+2348011111111", "08011111111"],
    ["2348011111111", "08011111111"],
    ["+234 803 123 4567", "08031234567"],
    ["07012345678", "07012345678"],
    ["09012345678", "09012345678"],
  ])("normalises %s to %s", (input, expected) => {
    expect(normaliseNigerianPhone(input)).toBe(expected);
  });

  it.each(["", "0801111111", "080111111111", "06011111111", "08211111111", "abc", "+1 555 0100"])(
    "rejects %s",
    (input) => {
      expect(normaliseNigerianPhone(input)).toBeNull();
    },
  );
});

describe("parseCreateOrderRequest", () => {
  const productId = "3f1c1b6e-2a51-4c32-9d1e-6b0f1c2d3e4f";

  it("accepts a data order and normalises the phone", () => {
    expect(
      parseCreateOrderRequest({ productId, recipientPhone: "+2348011111111", pin: "1357" }),
    ).toEqual({
      ok: true,
      value: { productId, recipientPhone: "08011111111", pin: "1357" },
    });
  });

  it("accepts an airtime order with an amount in kobo and a client reference", () => {
    expect(
      parseCreateOrderRequest({
        productId,
        recipientPhone: "08011111111",
        faceValueKobo: 100_000,
        clientReference: "tap-1234",
        pin: "1357",
      }),
    ).toEqual({
      ok: true,
      value: {
        productId,
        recipientPhone: "08011111111",
        faceValueKobo: 100_000,
        clientReference: "tap-1234",
        pin: "1357",
      },
    });
  });

  it("explains every problem at once", () => {
    const result = parseCreateOrderRequest({
      productId: "nope",
      recipientPhone: "123",
      faceValueKobo: 10.5,
      clientReference: "x".repeat(101),
      pin: "12a4",
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      "clientReference",
      "faceValueKobo",
      "pin",
      "productId",
      "recipientPhone",
    ]);
  });

  it.each([null, "text", [], 42])("rejects a body that isn't an object: %s", (body) => {
    expect(parseCreateOrderRequest(body).ok).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = parseCreateOrderRequest({});
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      "pin",
      "productId",
      "recipientPhone",
    ]);
  });
});

describe("airtimeCostKobo", () => {
  it.each([
    [50_000, 100, 49_500], // ₦500 at 1% off → ₦495
    [50_000, 250, 48_750],
    [10_000, 0, 10_000],
    [5_033, 100, 4_983], // discount 50.33 kobo rounds down to 50
  ])("%s kobo at %s bps → %s kobo", (face, bps, cost) => {
    expect(airtimeCostKobo(face, bps)).toBe(cost);
  });
});
