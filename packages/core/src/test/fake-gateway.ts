// A stand-in FundingGateway for tests: scripted payments, recorded calls, simple signatures.
import type {
  FundingGateway,
  ReserveAccountInput,
  ReservedAccounts,
  SignatureCheck,
  VerifiedPayment,
  WebhookEvent,
} from "../funding/types.ts";

export interface FakePayment {
  amountKobo: number;
  accountReference: string | null;
  status?: string;
}

export class FakeGateway implements FundingGateway {
  readonly name = "monnify";
  readonly reserved: ReserveAccountInput[] = [];
  readonly verified: string[] = [];
  /** What the gateway "knows": transactionReference → payment. */
  readonly payments = new Map<string, FakePayment>();
  /** What listAccountPayments returns per account reference. */
  readonly accountPayments = new Map<string, string[]>();
  /** Set to make verifyPayment throw (gateway down). */
  verifyError: Error | null = null;
  /** The only signature the fake accepts. */
  readonly goodSignature = "good-signature";

  async reserveAccount(input: ReserveAccountInput): Promise<ReservedAccounts> {
    this.reserved.push(input);
    const n = this.reserved.length;
    return {
      accountReference: input.accountReference,
      accounts: [
        {
          bankCode: "035",
          bankName: "Wema bank",
          accountNumber: `50000000${n}0`,
          accountName: input.customerName,
        },
        {
          bankCode: "50515",
          bankName: "Moniepoint",
          accountNumber: `60000000${n}0`,
          accountName: input.customerName,
        },
      ],
      raw: {},
    };
  }

  async getReservedAccount(): Promise<ReservedAccounts | null> {
    return null;
  }

  checkWebhookSignature(_rawBody: string, headers: Headers): SignatureCheck {
    return headers.get("monnify-signature") === this.goodSignature
      ? { ok: true, signed: true }
      : { ok: false, reason: "Signature does not match" };
  }

  parseWebhook(rawBody: string): WebhookEvent {
    try {
      const body = JSON.parse(rawBody) as {
        eventType?: string;
        eventData?: { transactionReference?: string };
      };
      const ref = body.eventData?.transactionReference;
      if (body.eventType === "SUCCESSFUL_TRANSACTION" && ref) {
        return { kind: "payment", transactionReference: ref };
      }
      return { kind: "ignored", reason: `Event ${body.eventType}` };
    } catch {
      return { kind: "ignored", reason: "not JSON" };
    }
  }

  async verifyPayment(transactionReference: string): Promise<VerifiedPayment> {
    this.verified.push(transactionReference);
    if (this.verifyError) throw this.verifyError;
    const payment = this.payments.get(transactionReference);
    const status = payment ? (payment.status ?? "PAID") : "NOT_FOUND";
    return {
      transactionReference,
      paid: status === "PAID",
      status,
      amountKobo: payment?.amountKobo ?? 0,
      accountReference: payment?.accountReference ?? null,
      paidAt: payment ? "14/11/2026 10:00:00 AM" : null,
      raw: { fake: true, status },
    };
  }

  async listAccountPayments(accountReference: string): Promise<string[]> {
    return this.accountPayments.get(accountReference) ?? [];
  }
}
