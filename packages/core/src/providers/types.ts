// The ProviderAdapter interface: every VTU provider (VTpass now, others later) is wrapped in a class
// with these four methods, so the rest of the app never needs to know which provider it is talking to.
import type { Kobo } from "../money.ts";

/**
 * Our own status for an order, whatever the provider calls it.
 * - success: delivered to the customer.
 * - pending: not known yet. Ask again later with requery(). Never refund a pending order.
 * - failed:  the provider confirmed nothing was delivered or charged, so it's safe to refund.
 */
export type ProviderStatus = "success" | "pending" | "failed";

export interface ProviderBalance {
  /** The provider wallet balance (our float with the provider), in kobo. */
  balanceKobo: Kobo;
  /** The provider's response exactly as received, for logging. */
  raw: unknown;
}

export interface ProviderVariation {
  /** The provider's plan code, e.g. "mtn-10mb-100". */
  code: string;
  name: string;
  /** The provider's price to us, in kobo. */
  priceKobo: Kobo;
  /** false when the customer chooses the amount (e.g. some flexible plans). */
  fixedPrice: boolean;
}

export interface ProviderVariations {
  serviceId: string;
  serviceName: string | null;
  variations: ProviderVariation[];
  raw: unknown;
}

export interface PurchaseOrder {
  /** Our unique id for this order. Reusing it on a retry is what prevents double charges. */
  requestId: string;
  /** The provider's service, e.g. "mtn" (airtime) or "mtn-data". */
  serviceId: string;
  /** Phone number receiving the airtime/data. */
  recipientPhone: string;
  /** Amount in kobo. Must be whole naira for VTpass. */
  amountKobo: Kobo;
  /** Plan code for data bundles; leave out for airtime. */
  variationCode?: string;
}

export interface PurchaseResult {
  status: ProviderStatus;
  requestId: string;
  /** The provider's own response code, e.g. "000" or "016"; null when no response arrived. */
  providerCode: string | null;
  /** Human-readable description from the provider (or from us, for network errors). */
  message: string;
  /** The provider's transaction id, when it gave one. */
  providerReference: string | null;
  /** What the provider says it charged our provider wallet, in kobo, when it said. */
  providerAmountKobo: Kobo | null;
  /** The provider's response exactly as received (or a short error description), for logging. */
  raw: unknown;
}

export interface ProviderAdapter {
  /** Short id stored on product rows, e.g. "vtpass". */
  readonly name: string;
  getBalance(): Promise<ProviderBalance>;
  getVariations(serviceId: string): Promise<ProviderVariations>;
  /** Never throws for provider or network problems: those come back as pending or failed. */
  purchase(order: PurchaseOrder): Promise<PurchaseResult>;
  /** Asks the provider for the latest status of an earlier purchase. Never throws for network problems. */
  requery(requestId: string): Promise<PurchaseResult>;
}

/** Thrown by getBalance/getVariations when the provider can't answer. Never contains API keys. */
export class ProviderError extends Error {
  readonly provider: string;
  readonly httpStatus: number | null;
  readonly providerCode: string | null;
  readonly raw: unknown;

  constructor(
    message: string,
    details: {
      provider: string;
      httpStatus?: number | null;
      providerCode?: string | null;
      raw?: unknown;
    },
  ) {
    super(message);
    this.name = "ProviderError";
    this.provider = details.provider;
    this.httpStatus = details.httpStatus ?? null;
    this.providerCode = details.providerCode ?? null;
    this.raw = details.raw;
  }
}
