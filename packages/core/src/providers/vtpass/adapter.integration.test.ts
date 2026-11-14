// Real calls to the VTpass SANDBOX (no real money). Skipped unless VTPASS_API_KEY is set,
// e.g. in .env.local on the laptop. Run with: pnpm --filter @repo/core test:integration
//
// Sandbox test numbers (vtpass.com/documentation/mtn-airtime-vtu):
//   08011111111  → success     201000000000 → pending     any other number → failed
import { describe, expect, it } from "vitest";

import { createVtpassAdapterFromEnv } from "./adapter.ts";
import { generateRequestId } from "./request-id.ts";

const hasKeys = Boolean(process.env.VTPASS_API_KEY);
const SUCCESS_PHONE = "08011111111";
const PENDING_PHONE = "201000000000";
const FAILED_PHONE = "08022222222";

describe.skipIf(!hasKeys)("VTpass sandbox (real HTTP)", { timeout: 60_000 }, () => {
  const adapter = () => createVtpassAdapterFromEnv();

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

  it("buys ₦100 MTN airtime for the success test number, then requery agrees", async () => {
    const requestId = generateRequestId();
    const result = await adapter().purchase({
      requestId,
      serviceId: "mtn",
      recipientPhone: SUCCESS_PHONE,
      amountKobo: 10_000,
    });
    expect(result.status, JSON.stringify(result.raw)).toBe("success");

    const again = await adapter().requery(requestId);
    expect(again.status, JSON.stringify(again.raw)).toBe("success");
  });

  it("never reports failed when the same request_id is sent twice (no refund of a delivered order)", async () => {
    const order = {
      requestId: generateRequestId(),
      serviceId: "mtn",
      recipientPhone: SUCCESS_PHONE,
      amountKobo: 10_000,
    };
    await adapter().purchase(order);
    const retry = await adapter().purchase(order);
    expect(retry.status, JSON.stringify(retry.raw)).not.toBe("failed");
  });

  it("buys MTN data for the success test number using a real plan code", async () => {
    const { variations } = await adapter().getVariations("mtn-data");
    const plan = variations.find((v) => v.fixedPrice && v.priceKobo > 0 && v.priceKobo % 100 === 0);
    expect(plan).toBeDefined();
    const result = await adapter().purchase({
      requestId: generateRequestId(),
      serviceId: "mtn-data",
      recipientPhone: SUCCESS_PHONE,
      amountKobo: plan!.priceKobo,
      variationCode: plan!.code,
    });
    expect(result.status, JSON.stringify(result.raw)).toBe("success");
  });

  it("reports pending for the pending test number", async () => {
    const result = await adapter().purchase({
      requestId: generateRequestId(),
      serviceId: "mtn",
      recipientPhone: PENDING_PHONE,
      amountKobo: 10_000,
    });
    expect(result.status, JSON.stringify(result.raw)).toBe("pending");
  });

  it("reports failed for any other number", async () => {
    const result = await adapter().purchase({
      requestId: generateRequestId(),
      serviceId: "mtn",
      recipientPhone: FAILED_PHONE,
      amountKobo: 10_000,
    });
    expect(result.status, JSON.stringify(result.raw)).toBe("failed");
  });

  it("requery of an unknown request_id is failed (VTpass never received it)", async () => {
    const result = await adapter().requery(generateRequestId());
    expect(result.status, JSON.stringify(result.raw)).toBe("failed");
  });
});
