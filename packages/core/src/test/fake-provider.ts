// A stand-in ProviderAdapter for tests: records every call and returns scripted results.
import type {
  ProviderAdapter,
  ProviderStatus,
  PurchaseOrder,
  PurchaseResult,
} from "../providers/types.ts";

type Outcome = ProviderStatus | { status: ProviderStatus; code?: string; message?: string } | Error;

export class FakeProvider implements ProviderAdapter {
  readonly name = "vtpass";
  readonly purchases: PurchaseOrder[] = [];
  readonly requeries: string[] = [];
  /** What purchase() returns. Change it per test. */
  purchaseOutcome: Outcome = "success";
  /** What requery() returns, per request_id; falls back to requeryDefault. */
  readonly requeryOutcomes = new Map<string, Outcome>();
  requeryDefault: Outcome = { status: "failed", code: "015", message: "INVALID REQUEST ID" };

  async getBalance() {
    return { balanceKobo: 0, raw: {} };
  }

  async getVariations(serviceId: string) {
    return { serviceId, serviceName: null, variations: [], raw: {} };
  }

  async purchase(order: PurchaseOrder): Promise<PurchaseResult> {
    this.purchases.push(order);
    return this.#result(order.requestId, this.purchaseOutcome);
  }

  async requery(requestId: string): Promise<PurchaseResult> {
    this.requeries.push(requestId);
    return this.#result(requestId, this.requeryOutcomes.get(requestId) ?? this.requeryDefault);
  }

  #result(requestId: string, outcome: Outcome): PurchaseResult {
    if (outcome instanceof Error) throw outcome;
    const o = typeof outcome === "string" ? { status: outcome } : outcome;
    const code = o.code ?? (o.status === "success" ? "000" : o.status === "failed" ? "016" : "099");
    return {
      status: o.status,
      requestId,
      providerCode: code,
      message: o.message ?? `fake ${o.status}`,
      providerReference: o.status === "success" ? `fake-${requestId}` : null,
      providerAmountKobo: null,
      raw: { fake: true, code },
    };
  }
}
