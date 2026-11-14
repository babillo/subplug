import { describe, expect, it } from "vitest";

import { normaliseNigerianPhone, parseCreateOrderRequest } from "./orders.ts";

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
    expect(parseCreateOrderRequest({ productId, recipientPhone: "+2348011111111" })).toEqual({
      ok: true,
      value: { productId, recipientPhone: "08011111111" },
    });
  });

  it("accepts an airtime order with an amount in kobo and a client reference", () => {
    expect(
      parseCreateOrderRequest({
        productId,
        recipientPhone: "08011111111",
        faceValueKobo: 100_000,
        clientReference: "tap-1234",
      }),
    ).toEqual({
      ok: true,
      value: {
        productId,
        recipientPhone: "08011111111",
        faceValueKobo: 100_000,
        clientReference: "tap-1234",
      },
    });
  });

  it("explains every problem at once", () => {
    const result = parseCreateOrderRequest({
      productId: "nope",
      recipientPhone: "123",
      faceValueKobo: 10.5,
      clientReference: "x".repeat(101),
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      "clientReference",
      "faceValueKobo",
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
      "productId",
      "recipientPhone",
    ]);
  });
});
