// The FundingGateway interface: every payment gateway (Monnify now, Paystack later) is wrapped in a
// class with these methods, so the funding service never needs to know which gateway it talks to.
import type { Kobo } from "../money.ts";

export interface ReserveAccountInput {
  /** Our reference for this customer's account at the gateway. We use the user's id. */
  accountReference: string;
  customerName: string;
  customerEmail: string;
  /** The customer's BVN or NIN (11 digits). Sent to the gateway; never stored by us. */
  bvn?: string;
  nin?: string;
}

export interface ReservedBankAccount {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface ReservedAccounts {
  accountReference: string;
  accounts: ReservedBankAccount[];
  raw: unknown;
}

export type SignatureCheck = { ok: true; signed: boolean } | { ok: false; reason: string };

export type WebhookEvent =
  { kind: "payment"; transactionReference: string } | { kind: "ignored"; reason: string };

/** A payment as the gateway reports it when we ask it directly (not what a webhook claims). */
export interface VerifiedPayment {
  transactionReference: string;
  /** true only when the gateway says the money has actually arrived. */
  paid: boolean;
  /** The gateway's status word, e.g. "PAID" or "PENDING". */
  status: string;
  amountKobo: Kobo;
  /** Which reserved account received it (our accountReference), if any. */
  accountReference: string | null;
  paidAt: string | null;
  raw: unknown;
}

export interface FundingGateway {
  /** Short id stored on funding rows, e.g. "monnify". */
  readonly name: string;
  reserveAccount(input: ReserveAccountInput): Promise<ReservedAccounts>;
  /** null when the gateway has no account with this reference. */
  getReservedAccount(accountReference: string): Promise<ReservedAccounts | null>;
  /** Checks the webhook really came from the gateway (HMAC signature over the raw body). */
  checkWebhookSignature(rawBody: string, headers: Headers): SignatureCheck;
  parseWebhook(rawBody: string): WebhookEvent;
  /** Asks the gateway directly whether a transaction is paid, how much, and into which account. */
  verifyPayment(transactionReference: string): Promise<VerifiedPayment>;
  /** Recent transaction references paid into an account (for the backup job). */
  listAccountPayments(accountReference: string): Promise<string[]>;
}

/** Thrown when the gateway can't answer. Never contains keys or tokens. */
export class FundingGatewayError extends Error {
  readonly gateway: string;
  readonly httpStatus: number | null;
  readonly gatewayCode: string | null;
  readonly raw: unknown;
  constructor(
    message: string,
    details: {
      gateway: string;
      httpStatus?: number | null;
      gatewayCode?: string | null;
      raw?: unknown;
    },
  ) {
    super(message);
    this.name = "FundingGatewayError";
    this.gateway = details.gateway;
    this.httpStatus = details.httpStatus ?? null;
    this.gatewayCode = details.gatewayCode ?? null;
    this.raw = details.raw;
  }
}
