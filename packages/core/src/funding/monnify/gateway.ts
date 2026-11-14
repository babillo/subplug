// Monnify implementation of FundingGateway (reserved accounts).
// Endpoints and signing confirmed against Monnify's official Node library (monnify-nodejs-lib):
// - POST /api/v1/auth/login with Basic base64(apiKey:secretKey) → accessToken, expiresIn (seconds)
// - POST /api/v2/bank-transfer/reserved-accounts, GET .../reserved-accounts/{accountReference}
// - GET  /api/v2/transactions/{transactionReference}  (reference URL-encoded: it contains "|")
// - GET  /api/v1/bank-transfer/reserved-accounts/transactions?accountReference=&page=&size=
// - Webhook signature: HMAC-SHA512 of the body with the secret key, hex, in `monnify-signature`.
// Amounts come in naira (number or "5000.00" text); we convert to integer kobo by digits.
// Keys and the access token live in private (#) fields: never logged, serialised or in errors.
import { createHmac, timingSafeEqual } from "node:crypto";

import { decimalToKobo } from "../../money.ts";
import {
  type FundingGateway,
  FundingGatewayError,
  type ReserveAccountInput,
  type ReservedAccounts,
  type ReservedBankAccount,
  type SignatureCheck,
  type VerifiedPayment,
  type WebhookEvent,
} from "../types.ts";

export interface MonnifyConfig {
  baseUrl: string;
  apiKey: string;
  secretKey: string;
  contractCode: string;
  /** Per-request timeout. Default 30s. */
  timeoutMs?: number;
  /** Injected in tests. */
  fetch?: typeof fetch;
}

const GATEWAY = "monnify";
/** Statuses that mean the money has arrived. */
const PAID_STATUSES = new Set(["PAID", "OVERPAID"]);
const ID_NUMBER = /^\d{11}$/;

type Envelope = {
  requestSuccessful?: boolean;
  responseMessage?: string;
  responseCode?: string;
  responseBody?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class MonnifyGateway implements FundingGateway {
  readonly name = GATEWAY;
  readonly baseUrl: string;
  /** True for sandbox.monnify.com: unsigned webhooks are tolerated there (they're re-checked). */
  readonly isSandbox: boolean;
  readonly #apiKey: string;
  readonly #secretKey: string;
  readonly #contractCode: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;
  #token: { value: string; expiresAt: number } | null = null;

  constructor(config: MonnifyConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.isSandbox = /sandbox\.monnify\.com/.test(this.baseUrl);
    this.#apiKey = config.apiKey;
    this.#secretKey = config.secretKey;
    this.#contractCode = config.contractCode;
    this.#timeoutMs = config.timeoutMs ?? 30_000;
    this.#fetch = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async reserveAccount(input: ReserveAccountInput): Promise<ReservedAccounts> {
    const bvn = input.bvn?.trim();
    const nin = input.nin?.trim();
    if (!(bvn && ID_NUMBER.test(bvn)) && !(nin && ID_NUMBER.test(nin))) {
      throw new TypeError("Monnify needs the customer's 11-digit BVN or NIN");
    }
    const response = await this.#request("POST", "/api/v2/bank-transfer/reserved-accounts", {
      accountReference: input.accountReference,
      accountName: input.customerName,
      currencyCode: "NGN",
      contractCode: this.#contractCode,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      ...(bvn && ID_NUMBER.test(bvn) ? { bvn } : { nin }),
      getAllAvailableBanks: true,
    });
    if (response.ok) return this.#toAccounts(input.accountReference, response.envelope);

    // Already reserved (e.g. a retry): return what Monnify has instead of failing.
    const existing = await this.getReservedAccount(input.accountReference);
    if (existing) return existing;
    throw this.#error("Monnify refused to reserve the account", response);
  }

  async getReservedAccount(accountReference: string): Promise<ReservedAccounts | null> {
    const response = await this.#request(
      "GET",
      `/api/v2/bank-transfer/reserved-accounts/${encodeURIComponent(accountReference)}`,
    );
    if (!response.ok) {
      if (response.httpStatus === 404 || response.envelope?.requestSuccessful === false)
        return null;
      throw this.#error("Monnify couldn't look up the reserved account", response);
    }
    return this.#toAccounts(accountReference, response.envelope);
  }

  async verifyPayment(transactionReference: string): Promise<VerifiedPayment> {
    const response = await this.#request(
      "GET",
      `/api/v2/transactions/${encodeURIComponent(transactionReference)}`,
    );
    const body = response.envelope?.responseBody;
    // A clear "no such transaction" (4xx, other than our own auth/rate-limit problems) is a final
    // answer: nothing to credit. Outages and server errors throw instead, so the caller retries.
    const isClientError =
      response.httpStatus >= 400 &&
      response.httpStatus < 500 &&
      ![401, 403, 408, 429].includes(response.httpStatus);
    if (!response.ok && isClientError) {
      return {
        transactionReference,
        paid: false,
        status: "NOT_FOUND",
        amountKobo: 0,
        accountReference: null,
        paidAt: null,
        raw: response.envelope ?? response.text,
      };
    }
    if (!response.ok || !isRecord(body)) {
      throw this.#error(`Monnify couldn't confirm transaction ${transactionReference}`, response);
    }
    const status = String(body.paymentStatus ?? "UNKNOWN").toUpperCase();
    const product = isRecord(body.product) ? body.product : {};
    const amount = body.amountPaid;
    return {
      transactionReference: String(body.transactionReference ?? transactionReference),
      paid: PAID_STATUSES.has(status),
      status,
      amountKobo:
        typeof amount === "number" || typeof amount === "string" ? decimalToKobo(amount) : 0,
      accountReference:
        product.type === "RESERVED_ACCOUNT" && typeof product.reference === "string"
          ? product.reference
          : null,
      paidAt: typeof body.paidOn === "string" ? body.paidOn : null,
      raw: response.envelope,
    };
  }

  async listAccountPayments(accountReference: string): Promise<string[]> {
    const query = new URLSearchParams({ accountReference, page: "0", size: "50" });
    const response = await this.#request(
      "GET",
      `/api/v1/bank-transfer/reserved-accounts/transactions?${query}`,
    );
    const body = response.envelope?.responseBody;
    if (!response.ok || !isRecord(body)) {
      throw this.#error("Monnify couldn't list the account's payments", response);
    }
    const content = Array.isArray(body.content) ? body.content : [];
    return content
      .filter(isRecord)
      .map((item) => item.transactionReference)
      .filter((ref): ref is string => typeof ref === "string" && ref !== "");
  }

  checkWebhookSignature(rawBody: string, headers: Headers): SignatureCheck {
    const signature = headers.get("monnify-signature")?.trim().toLowerCase();
    if (!signature) {
      // Monnify's sandbox may not sign webhooks. Safe to accept there only because every payment
      // is re-confirmed with Monnify's API (using our secret) before anything is credited.
      return this.isSandbox
        ? { ok: true, signed: false }
        : { ok: false, reason: "Missing monnify-signature header" };
    }
    // Monnify's library signs JSON.stringify(parsedBody); for a compact body that's identical to
    // the raw bytes. Accept either, both keyed with our secret.
    const candidates = [rawBody];
    try {
      candidates.push(JSON.stringify(JSON.parse(rawBody)));
    } catch {
      // not JSON: only the raw body can match
    }
    const matches = candidates.some((text) =>
      safeEqualHex(createHmac("sha512", this.#secretKey).update(text).digest("hex"), signature),
    );
    return matches ? { ok: true, signed: true } : { ok: false, reason: "Signature does not match" };
  }

  parseWebhook(rawBody: string): WebhookEvent {
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { kind: "ignored", reason: "Body is not JSON" };
    }
    if (!isRecord(body)) return { kind: "ignored", reason: "Body is not an object" };
    if (body.eventType !== "SUCCESSFUL_TRANSACTION") {
      return { kind: "ignored", reason: `Event ${String(body.eventType)} is not a payment` };
    }
    const data = isRecord(body.eventData) ? body.eventData : {};
    const ref = data.transactionReference;
    if (typeof ref !== "string" || ref === "") {
      return { kind: "ignored", reason: "Payment event has no transactionReference" };
    }
    return { kind: "payment", transactionReference: ref };
  }

  /** Keeps keys and tokens out of console.log / JSON output. */
  toJSON() {
    return { gateway: GATEWAY, baseUrl: this.baseUrl };
  }

  // -------------------------------------------------------------------------------------------

  #toAccounts(accountReference: string, envelope: Envelope | null): ReservedAccounts {
    const body = envelope?.responseBody;
    const list = isRecord(body) && Array.isArray(body.accounts) ? body.accounts : [];
    const accounts: ReservedBankAccount[] = list.filter(isRecord).map((a) => ({
      bankCode: String(a.bankCode ?? ""),
      bankName: String(a.bankName ?? ""),
      accountNumber: String(a.accountNumber ?? ""),
      accountName: String(a.accountName ?? ""),
    }));
    if (accounts.length === 0) {
      throw new FundingGatewayError("Monnify returned no account numbers", {
        gateway: GATEWAY,
        raw: envelope,
      });
    }
    return { accountReference, accounts, raw: envelope };
  }

  async #accessToken(): Promise<string> {
    const now = Date.now();
    if (this.#token && this.#token.expiresAt > now) return this.#token.value;

    const basic = Buffer.from(`${this.#apiKey}:${this.#secretKey}`).toString("base64");
    const response = await this.#send("POST", "/api/v1/auth/login", `Basic ${basic}`, {});
    const body = response.envelope?.responseBody;
    if (!response.ok || !isRecord(body) || typeof body.accessToken !== "string") {
      throw this.#error(
        "Monnify sign-in failed: check MONNIFY_API_KEY and MONNIFY_SECRET_KEY",
        response,
      );
    }
    const expiresInSeconds = typeof body.expiresIn === "number" ? body.expiresIn : 300;
    // Refresh a minute early so a request never goes out with a token about to expire.
    this.#token = {
      value: body.accessToken,
      expiresAt: now + Math.max(0, expiresInSeconds - 60) * 1000,
    };
    return body.accessToken;
  }

  async #request(method: "GET" | "POST", path: string, payload?: unknown) {
    return this.#send(method, path, `Bearer ${await this.#accessToken()}`, payload);
  }

  async #send(method: "GET" | "POST", path: string, authorization: string, payload?: unknown) {
    let response: Response;
    try {
      response = await this.#fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization,
          ...(payload === undefined ? {} : { "content-type": "application/json" }),
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      // Only the error message is kept: never the request, which holds the credentials.
      throw new FundingGatewayError(
        `Monnify unreachable: ${error instanceof Error ? error.message : String(error)}`,
        { gateway: GATEWAY },
      );
    }
    const text = await response.text().catch(() => "");
    let envelope: Envelope | null = null;
    try {
      const parsed: unknown = JSON.parse(text);
      envelope = isRecord(parsed) ? (parsed as Envelope) : null;
    } catch {
      envelope = null;
    }
    const ok = response.ok && envelope?.requestSuccessful !== false;
    return {
      ok,
      httpStatus: response.status,
      envelope,
      text: envelope ? null : text.slice(0, 500),
    };
  }

  #error(
    message: string,
    response: { httpStatus: number; envelope: Envelope | null; text: string | null },
  ): FundingGatewayError {
    const detail = response.envelope?.responseMessage;
    return new FundingGatewayError(detail ? `${message}: ${detail}` : message, {
      gateway: GATEWAY,
      httpStatus: response.httpStatus,
      gatewayCode: response.envelope?.responseCode ?? null,
      raw: response.envelope ?? response.text,
    });
  }
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export const MONNIFY_ENV_NAMES = [
  "MONNIFY_BASE_URL",
  "MONNIFY_API_KEY",
  "MONNIFY_SECRET_KEY",
  "MONNIFY_CONTRACT_CODE",
] as const;

/** Builds the gateway from env vars. Errors name missing settings, never values. */
export function createMonnifyGatewayFromEnv(
  env: Record<string, string | undefined> = process.env,
  options: Pick<MonnifyConfig, "fetch" | "timeoutMs"> = {},
): MonnifyGateway {
  const value = (name: (typeof MONNIFY_ENV_NAMES)[number]) => env[name]?.trim() ?? "";
  const missing = MONNIFY_ENV_NAMES.filter((name) => value(name) === "");
  if (missing.length > 0) {
    throw new Error(
      `Missing Monnify settings: ${missing.join(", ")}. Add them to .env.local (laptop) ` +
        "or the cloud environment's settings. See README.",
    );
  }
  return new MonnifyGateway({
    baseUrl: value("MONNIFY_BASE_URL"),
    apiKey: value("MONNIFY_API_KEY"),
    secretKey: value("MONNIFY_SECRET_KEY"),
    contractCode: value("MONNIFY_CONTRACT_CODE"),
    ...options,
  });
}
