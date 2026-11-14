// Real calls to the VTpass SANDBOX (no real money). Skipped unless VTPASS_API_KEY is set,
// e.g. in .env.local on the laptop. Run with: pnpm --filter @repo/core test:integration
//
// Before running: on sandbox.vtpass.com, Profile → Product Settings, switch on (whitelist)
// MTN Airtime and MTN Data. Products are off by default; VTpass replies 028 otherwise.
//
// Sandbox test numbers (vtpass.com/documentation/mtn-airtime-vtu):
//   08011111111  → success     201000000000 → pending     any other number → failed
// VTpass rejects any new purchase to the same recipient within 15 seconds (code 019, observed on
// the sandbox; the docs say 30s for the same service). buy() waits between new purchases to the
// same number so the tests don't trip it.
import { describe, expect, it } from "vitest";

import type { PurchaseOrder, PurchaseResult } from "../types.ts";
import { createVtpassAdapterFromEnv } from "./adapter.ts";
import { generateRequestId } from "./request-id.ts";

const hasKeys = Boolean(process.env.VTPASS_API_KEY);
const SUCCESS_PHONE = "08011111111";
const PENDING_PHONE = "201000000000";
const FAILED_PHONE = "08022222222";

const adapter = () => createVtpassAdapterFromEnv();
const show = (result: PurchaseResult) => JSON.stringify(result.raw);

const SAME_RECIPIENT_GAP_MS = 16_000;
const lastPurchaseAt = new Map<string, number>();

/** Waits until 16s have passed since the last new purchase to this number (VTpass code 019). */
async function waitForRecipientGap(phone: string) {
  const last = lastPurchaseAt.get(phone);
  const waitMs = last === undefined ? 0 : last + SAME_RECIPIENT_GAP_MS - Date.now();
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

/**
 * Buys, but stops with a clear instruction if the sandbox account hasn't enabled the product.
 * Passing an existing requestId is a resend of an earlier order, so it doesn't wait.
 */
async function buy(order: Omit<PurchaseOrder, "requestId"> & { requestId?: string }) {
  const isResend = order.requestId !== undefined && lastPurchaseAt.has(`id:${order.requestId}`);
  if (!isResend) await waitForRecipientGap(order.recipientPhone);
  const requestId = order.requestId ?? generateRequestId();
  const result = await adapter().purchase({ ...order, requestId });
  if (!isResend) {
    lastPurchaseAt.set(order.recipientPhone, Date.now());
    lastPurchaseAt.set(`id:${requestId}`, Date.now());
  }
  if (result.providerCode === "028") {
    throw new Error(
      `VTpass sandbox: "${order.serviceId}" is not switched on for your account (code 028). ` +
        "Enable it at sandbox.vtpass.com → Profile → Product Settings, then rerun.",
    );
  }
  return result;
}

describe.skipIf(!hasKeys)("VTpass sandbox (real HTTP)", { timeout: 60_000 }, () => {
  it("refuses to run against live VTpass", () => {
    expect(process.env.VTPASS_BASE_URL).toContain("sandbox.vtpass.com");
  });

  it("reads the sandbox wallet balance in kobo", async () => {
    const { balanceKobo } = await adapter().getBalance();
    expect(Number.isSafeInteger(balanceKobo)).toBe(true);
  });

  it("lists MTN data plans with kobo prices", async () => {
    const { variations } = await adapter().getVariations("mtn-data");
    expect(variations.length).toBeGreaterThan(0);
    for (const plan of variations) {
      expect(plan.code).not.toBe("");
      expect(Number.isSafeInteger(plan.priceKobo)).toBe(true);
    }
  });

  it("buys ₦100 MTN airtime; requery agrees; resending the same request_id never reports failed", async () => {
    const requestId = generateRequestId();
    const order = {
      requestId,
      serviceId: "mtn",
      recipientPhone: SUCCESS_PHONE,
      amountKobo: 10_000,
    };

    const first = await buy(order);
    expect(first.status, show(first)).toBe("success");

    const requeried = await adapter().requery(requestId);
    expect(requeried.status, show(requeried)).toBe("success");

    // A retry with the same request_id must never come back "failed": that would refund a
    // delivered order. VTpass should recognise the id (014) or return the original result.
    const resent = await buy(order);
    expect(resent.status, show(resent)).not.toBe("failed");
  });

  it("buys MTN data for the success test number using a real plan code", async () => {
    const { variations } = await adapter().getVariations("mtn-data");
    const plan = variations.find((v) => v.fixedPrice && v.priceKobo > 0 && v.priceKobo % 100 === 0);
    expect(plan).toBeDefined();
    const result = await buy({
      serviceId: "mtn-data",
      recipientPhone: SUCCESS_PHONE,
      amountKobo: plan!.priceKobo,
      variationCode: plan!.code,
    });
    expect(result.status, show(result)).toBe("success");
  });

  it("reports pending for the pending test number", async () => {
    const result = await buy({
      serviceId: "mtn",
      recipientPhone: PENDING_PHONE,
      amountKobo: 10_000,
    });
    expect(result.status, show(result)).toBe("pending");
  });

  it("reports failed for any other number", async () => {
    const result = await buy({
      serviceId: "mtn",
      recipientPhone: FAILED_PHONE,
      amountKobo: 10_000,
    });
    expect(result.status, show(result)).toBe("failed");
  });

  it("requery of an unknown request_id is failed with 015 (VTpass never received it)", async () => {
    const result = await adapter().requery(generateRequestId());
    expect(result.status, show(result)).toBe("failed");
    expect(result.providerCode, show(result)).toBe("015");
  });
});
