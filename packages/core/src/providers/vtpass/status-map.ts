// Maps VTpass responses to our three statuses.
// Source: vtpass.com/documentation/response-codes (checked 2026-11-14).
//
// The safety rule: "failed" triggers a refund, so we only say failed when VTpass clearly says nothing
// was delivered or charged. Anything unclear is "pending", and the re-check job asks again later.
// VTpass's own docs say to treat timeouts, no response and unexpected responses as pending.
import type { ProviderStatus } from "../types.ts";

/** Codes VTpass documents as "not processed / failed / reversed". Safe to refund. */
const FAILED_CODES: Record<string, string> = {
  "016": "TRANSACTION FAILED",
  "040": "TRANSACTION REVERSAL (reversed to wallet)",
  "091": "TRANSACTION NOT PROCESSED (no charge)",
  // Rejected before processing, so nothing was charged:
  "010": "VARIATION CODE DOES NOT EXIST",
  "011": "INVALID ARGUMENTS",
  "012": "PRODUCT DOES NOT EXIST",
  "013": "BELOW MINIMUM AMOUNT ALLOWED",
  "017": "ABOVE MAXIMUM AMOUNT ALLOWED",
  "018": "LOW WALLET BALANCE (our VTpass wallet needs funding)",
  "019": "LIKELY DUPLICATE TRANSACTION (same number within 30 seconds)",
  "021": "ACCOUNT LOCKED",
  "022": "ACCOUNT SUSPENDED",
  "023": "API ACCESS NOT ENABLED FOR USER",
  "024": "ACCOUNT INACTIVE",
  "025": "RECIPIENT BANK INVALID",
  "026": "RECIPIENT ACCOUNT COULD NOT BE VERIFIED",
  "027": "IP NOT WHITELISTED",
  "028": "PRODUCT IS NOT WHITELISTED ON YOUR ACCOUNT",
  "030": "BILLER NOT REACHABLE AT THIS POINT",
  "031": "BELOW MINIMUM QUANTITY ALLOWED",
  "032": "ABOVE MAXIMUM QUANTITY ALLOWED",
  "034": "SERVICE SUSPENDED",
  "035": "SERVICE INACTIVE",
  "085": "IMPROPER REQUEST ID",
  "087": "INVALID CREDENTIALS",
};

/**
 * Codes that mean "not finished / not clear". Listed for documentation; any code not in FAILED_CODES
 * (and not 000) is pending anyway.
 */
export const PENDING_CODES: Record<string, string> = {
  "099": "TRANSACTION IS PROCESSING",
  "089": "REQUEST IS PROCESSING, PLEASE WAIT",
  "001": "TRANSACTION QUERY",
  // "Contact VTpass for more information": needs a human, so keep it pending rather than refund.
  "044": "TRANSACTION RESOLVED",
  "083": "SYSTEM ERROR",
  // On /pay: this request_id was already used, i.e. this is a retry. Requery to learn the real result.
  "014": "REQUEST ID ALREADY EXIST",
  // On /pay only (on /requery it means "never received", which is a safe failure).
  "015": "INVALID REQUEST ID",
};

/** Transaction statuses inside a code-000 response. */
const SUCCESS_TX_STATUSES = new Set(["delivered"]);
const FAILED_TX_STATUSES = new Set(["failed", "reversed"]);

export interface ClassifyInput {
  operation: "purchase" | "requery";
  httpStatus: number;
  body: unknown;
}

export interface Classification {
  status: ProviderStatus;
  providerCode: string | null;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** VTpass sends codes as strings ("016"), but be lenient with numbers (16 → "016"). */
export function normaliseCode(code: unknown): string | null {
  if (typeof code === "number" && Number.isInteger(code)) return String(code).padStart(3, "0");
  if (typeof code === "string" && code.trim() !== "") return code.trim();
  return null;
}

function transactionStatus(body: Record<string, unknown>): string | null {
  const content = body.content;
  if (!isRecord(content) || !isRecord(content.transactions)) return null;
  const status = content.transactions.status;
  return typeof status === "string" ? status.toLowerCase() : null;
}

export function classifyVtpassResponse({
  operation,
  httpStatus,
  body,
}: ClassifyInput): Classification {
  // Credentials rejected: the request was refused before anything happened.
  // (Real sandbox reply without valid keys: HTTP 401, body "Invalid Credentials.")
  if (httpStatus === 401 || httpStatus === 403) {
    const message = typeof body === "string" ? body : "Credentials rejected";
    return { status: "failed", providerCode: null, message: `HTTP ${httpStatus}: ${message}` };
  }

  if (!isRecord(body)) {
    return {
      status: "pending",
      providerCode: null,
      message: `Unexpected response (HTTP ${httpStatus})`,
    };
  }

  const providerCode = normaliseCode(body.code);
  // Most replies use response_description; some (e.g. 087 on HTTP 401) use message.
  const rawDescription = body.response_description ?? body.message;
  const description = typeof rawDescription === "string" ? rawDescription : null;

  if (providerCode === "000") {
    const txStatus = transactionStatus(body);
    const message = description ?? `Transaction status: ${txStatus ?? "unknown"}`;
    if (txStatus && SUCCESS_TX_STATUSES.has(txStatus))
      return { status: "success", providerCode, message };
    if (txStatus && FAILED_TX_STATUSES.has(txStatus))
      return { status: "failed", providerCode, message };
    return { status: "pending", providerCode, message }; // pending, initiated, missing or unknown
  }

  if (providerCode === "015" && operation === "requery") {
    return {
      status: "failed",
      providerCode,
      message: description ?? "INVALID REQUEST ID (VTpass never received this request_id)",
    };
  }

  if (providerCode && providerCode in FAILED_CODES) {
    return {
      status: "failed",
      providerCode,
      message: description ?? FAILED_CODES[providerCode] ?? "",
    };
  }

  return {
    status: "pending",
    providerCode,
    message:
      description ??
      (providerCode
        ? (PENDING_CODES[providerCode] ?? `Unknown VTpass code ${providerCode}`)
        : `Unexpected response (HTTP ${httpStatus})`),
  };
}
