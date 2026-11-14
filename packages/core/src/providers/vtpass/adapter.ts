// VTpass implementation of ProviderAdapter. Docs: vtpass.com/documentation
// - GET requests send headers api-key + public-key; POST requests send api-key + secret-key.
// - Keys are kept in private (#) fields so they never show up when the adapter is logged,
//   serialised or included in an error.
import { decimalToKobo, type Kobo, koboToWholeNaira } from "../../money.ts";
import {
  type ProviderAdapter,
  type ProviderBalance,
  ProviderError,
  type ProviderVariation,
  type ProviderVariations,
  type PurchaseOrder,
  type PurchaseResult,
} from "../types.ts";
import { isValidRequestId } from "./request-id.ts";
import { classifyVtpassResponse, normaliseCode } from "./status-map.ts";

export interface VtpassConfig {
  baseUrl: string;
  apiKey: string;
  publicKey: string;
  secretKey: string;
  /** How long to wait for VTpass before giving up (the order then stays pending). Default 45s. */
  timeoutMs?: number;
  /** Injected in tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

type HttpOutcome =
  | { kind: "response"; httpStatus: number; body: unknown }
  | { kind: "error"; error: "timeout" | "network"; message: string };

const PROVIDER = "vtpass";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class VtpassAdapter implements ProviderAdapter {
  readonly name = PROVIDER;
  readonly baseUrl: string;
  readonly #apiKey: string;
  readonly #publicKey: string;
  readonly #secretKey: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(config: VtpassConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.#apiKey = config.apiKey;
    this.#publicKey = config.publicKey;
    this.#secretKey = config.secretKey;
    this.#timeoutMs = config.timeoutMs ?? 45_000;
    this.#fetch = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async getBalance(): Promise<ProviderBalance> {
    const body = await this.#getOrThrow("/balance");
    const balance = isRecord(body) && isRecord(body.contents) ? body.contents.balance : undefined;
    if (typeof balance !== "number" && typeof balance !== "string") {
      throw new ProviderError("VTpass balance response had no balance", {
        provider: PROVIDER,
        raw: body,
      });
    }
    return { balanceKobo: decimalToKobo(balance), raw: body };
  }

  async getVariations(serviceId: string): Promise<ProviderVariations> {
    const query = new URLSearchParams({ serviceID: serviceId });
    const body = await this.#getOrThrow(`/service-variations?${query}`);
    const content = isRecord(body) ? body.content : undefined;
    // VTpass returns the list as `variations`, and (misspelled) as `varations` in some responses.
    const list = isRecord(content) ? (content.variations ?? content.varations) : undefined;
    if (!Array.isArray(list)) {
      throw new ProviderError(`VTpass returned no plans for "${serviceId}"`, {
        provider: PROVIDER,
        providerCode: isRecord(body) ? normaliseCode(body.code) : null,
        raw: body,
      });
    }
    const variations: ProviderVariation[] = list.filter(isRecord).map((item) => ({
      code: String(item.variation_code ?? ""),
      name: String(item.name ?? ""),
      priceKobo: decimalToKobo(String(item.variation_amount ?? "0")),
      fixedPrice: String(item.fixedPrice ?? "").toLowerCase() === "yes",
    }));
    const serviceName =
      isRecord(content) && typeof content.ServiceName === "string" ? content.ServiceName : null;
    return { serviceId, serviceName, variations, raw: body };
  }

  async purchase(order: PurchaseOrder): Promise<PurchaseResult> {
    // Validate before sending anything: a bad order must fail loudly, not reach VTpass.
    if (!isValidRequestId(order.requestId)) {
      throw new TypeError(`Invalid request_id "${order.requestId}": use generateRequestId()`);
    }
    const amount = koboToWholeNaira(order.amountKobo);

    const payload: Record<string, unknown> = {
      request_id: order.requestId,
      serviceID: order.serviceId,
      // VTpass names the recipient differently per product; for airtime/data both are the phone.
      billersCode: order.recipientPhone,
      ...(order.variationCode ? { variation_code: order.variationCode } : {}),
      amount,
      phone: order.recipientPhone,
    };
    return this.#postTransaction("purchase", "/pay", order.requestId, payload);
  }

  async requery(requestId: string): Promise<PurchaseResult> {
    return this.#postTransaction("requery", "/requery", requestId, { request_id: requestId });
  }

  /** Keeps keys out of console.log / JSON output. */
  toJSON() {
    return { provider: PROVIDER, baseUrl: this.baseUrl };
  }

  async #postTransaction(
    operation: "purchase" | "requery",
    path: string,
    requestId: string,
    payload: Record<string, unknown>,
  ): Promise<PurchaseResult> {
    const outcome = await this.#send("POST", path, payload);

    if (outcome.kind === "error") {
      // No answer: VTpass may or may not have charged. Never "failed" here; requery decides later.
      return {
        status: "pending",
        requestId,
        providerCode: null,
        message: outcome.message,
        providerReference: null,
        providerAmountKobo: null,
        raw: { error: outcome.error, message: outcome.message },
      };
    }

    const { status, providerCode, message } = classifyVtpassResponse({
      operation,
      httpStatus: outcome.httpStatus,
      body: outcome.body,
    });
    const tx = transactionOf(outcome.body);
    return {
      status,
      requestId,
      providerCode,
      message,
      providerReference: tx && tx.transactionId != null ? String(tx.transactionId) : null,
      providerAmountKobo: tx ? safeKobo(tx.total_amount ?? tx.amount) : null,
      raw: outcome.body,
    };
  }

  async #getOrThrow(path: string): Promise<unknown> {
    const outcome = await this.#send("GET", path);
    if (outcome.kind === "error") {
      throw new ProviderError(`VTpass ${outcome.error}: ${outcome.message}`, {
        provider: PROVIDER,
      });
    }
    if (outcome.httpStatus < 200 || outcome.httpStatus >= 300) {
      throw new ProviderError(
        `VTpass returned HTTP ${outcome.httpStatus} for GET ${path.split("?")[0]}`,
        {
          provider: PROVIDER,
          httpStatus: outcome.httpStatus,
          providerCode: isRecord(outcome.body) ? normaliseCode(outcome.body.code) : null,
          raw: outcome.body,
        },
      );
    }
    return outcome.body;
  }

  async #send(method: "GET" | "POST", path: string, payload?: unknown): Promise<HttpOutcome> {
    const headers: Record<string, string> =
      method === "GET"
        ? { "api-key": this.#apiKey, "public-key": this.#publicKey }
        : {
            "api-key": this.#apiKey,
            "secret-key": this.#secretKey,
            "content-type": "application/json",
          };

    let response: Response;
    try {
      response = await this.#fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      const name = error instanceof Error || error instanceof DOMException ? error.name : "";
      const isTimeout = name === "TimeoutError" || name === "AbortError";
      // Only the error's name/message is kept: never the request (which holds the keys).
      const message = error instanceof Error ? error.message : String(error);
      return {
        kind: "error",
        error: isTimeout ? "timeout" : "network",
        message: isTimeout
          ? `No response from VTpass within ${this.#timeoutMs}ms`
          : `Network error: ${message}`,
      };
    }

    const text = await response.text().catch(() => "");
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Not JSON (e.g. an HTML error page): keep the text as-is for logging.
    }
    return { kind: "response", httpStatus: response.status, body };
  }
}

function transactionOf(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body) || !isRecord(body.content) || !isRecord(body.content.transactions))
    return null;
  return body.content.transactions;
}

function safeKobo(value: unknown): Kobo | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  try {
    return decimalToKobo(value);
  } catch {
    return null;
  }
}

export const VTPASS_ENV_NAMES = [
  "VTPASS_BASE_URL",
  "VTPASS_API_KEY",
  "VTPASS_PUBLIC_KEY",
  "VTPASS_SECRET_KEY",
] as const;

/**
 * Builds the adapter from env vars (cloud environment settings, or .env.local on the laptop).
 * Error messages name missing variables but never print values.
 */
export function createVtpassAdapterFromEnv(
  env: Record<string, string | undefined> = process.env,
  options: Pick<VtpassConfig, "timeoutMs" | "fetch"> = {},
): VtpassAdapter {
  // Trim stray spaces/line breaks (easy to paste by accident); a blank value counts as missing.
  const value = (name: (typeof VTPASS_ENV_NAMES)[number]) => env[name]?.trim() ?? "";
  const missing = VTPASS_ENV_NAMES.filter((name) => value(name) === "");
  if (missing.length > 0) {
    throw new Error(
      `Missing VTpass settings: ${missing.join(", ")}. Add them to .env.local (laptop) ` +
        "or the cloud environment's settings. See README.",
    );
  }
  return new VtpassAdapter({
    baseUrl: value("VTPASS_BASE_URL"),
    apiKey: value("VTPASS_API_KEY"),
    publicKey: value("VTPASS_PUBLIC_KEY"),
    secretKey: value("VTPASS_SECRET_KEY"),
    ...options,
  });
}
