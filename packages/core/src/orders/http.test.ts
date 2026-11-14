import { describe, expect, it } from "vitest";

import { InsufficientFundsError, ReferenceConflictError } from "../wallet/wallet.ts";
import { PurchaseError, RecentPurchaseError } from "./errors.ts";
import { orderResponse, purchaseErrorResponse } from "./http.ts";
import type { Order } from "./purchase.ts";

const base: Order = {
  id: "11111111-1111-4111-8111-111111111111",
  requestId: "202611141005abcdefghijkl",
  clientReference: null,
  userId: "u",
  walletId: "w",
  productId: "p",
  providerId: "vtpass",
  recipientPhone: "08011111111",
  faceValueKobo: 100_000,
  amountKobo: 99_000,
  status: "success",
  providerCode: "000",
  providerMessage: "TRANSACTION SUCCESSFUL",
  providerReference: "17311234567890",
  providerResponse: { secret: "raw provider data" },
  attempts: 1,
  lastCheckedAt: new Date("2026-11-14T10:00:00Z"),
  refundedAt: null,
  createdAt: new Date("2026-11-14T10:00:00Z"),
  updatedAt: new Date("2026-11-14T10:00:00Z"),
};

describe("orderResponse", () => {
  it("returns 201 for a new order and only customer-safe fields", () => {
    const { status, body } = orderResponse(base, false);
    expect(status).toBe(201);
    expect(body.order).toEqual({
      id: base.id,
      status: "success",
      productId: "p",
      recipientPhone: "08011111111",
      amountKobo: 99_000,
      faceValueKobo: 100_000,
      createdAt: "2026-11-14T10:00:00.000Z",
      refundedAt: null,
    });
    expect(JSON.stringify(body)).not.toContain("raw provider data");
    expect(body.message).toMatch(/successful/i);
  });

  it("returns 200 and duplicate: true for a repeated tap", () => {
    const { status, body } = orderResponse(base, true);
    expect(status).toBe(200);
    expect(body.duplicate).toBe(true);
  });

  it("explains pending and refunded orders in plain words", () => {
    expect(orderResponse({ ...base, status: "pending" }, false).body.message).toMatch(
      /processing/i,
    );
    const failed = orderResponse(
      { ...base, status: "failed", refundedAt: new Date("2026-11-14T10:00:05Z") },
      false,
    ).body.message;
    expect(failed).toMatch(/refunded/i);
    expect(failed).toContain("₦990.00");
  });

  it("tells the customer to wait when VTpass rejected a too-quick repeat (019)", () => {
    const { body } = orderResponse(
      { ...base, status: "failed", providerCode: "019", refundedAt: new Date() },
      false,
    );
    expect(body.message).toMatch(/15 seconds/);
  });
});

describe("purchaseErrorResponse", () => {
  it.each([
    [new PurchaseError("invalid_phone", "x"), 400],
    [new PurchaseError("invalid_amount", "x"), 400],
    [new PurchaseError("user_not_found", "x"), 404],
    [new PurchaseError("user_suspended", "x"), 403],
    [new PurchaseError("product_not_found", "x"), 404],
    [new PurchaseError("product_unavailable", "x"), 409],
    [new PurchaseError("price_missing", "x"), 409],
    [new ReferenceConflictError("x"), 409],
  ])("maps %s to HTTP %s", (error, status) => {
    expect(purchaseErrorResponse(error)?.status).toBe(status);
  });

  it("maps insufficient funds to 402 with a clear message", () => {
    const res = purchaseErrorResponse(new InsufficientFundsError("w", 50_000, 99_000));
    expect(res).toMatchObject({ status: 402, body: { error: { code: "insufficient_funds" } } });
    expect(res?.body.error.message).toContain("₦500.00");
  });

  it("maps the 15-second rule to 429 with Retry-After", () => {
    const res = purchaseErrorResponse(new RecentPurchaseError(12));
    expect(res).toMatchObject({
      status: 429,
      headers: { "Retry-After": "12" },
      body: { error: { code: "recent_purchase", retryAfterSeconds: 12 } },
    });
  });

  it("returns null for unexpected errors (the route answers 500 and logs them)", () => {
    expect(purchaseErrorResponse(new Error("database down"))).toBeNull();
  });
});
