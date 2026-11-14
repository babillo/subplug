import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { FundingGatewayError } from "../types.ts";
import { createMonnifyGatewayFromEnv, MonnifyGateway } from "./gateway.ts";

const SANDBOX = "https://sandbox.monnify.com";
const KEYS = { apiKey: "MK_TEST_APIKEY123", secretKey: "SECRETKEY456", contractCode: "1234567890" };

type FakeResponse = { status?: number; body: unknown } | Error;

function fakeFetch(...responses: FakeResponse[]) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error("fakeFetch: no response queued");
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  });
}

const login = (expiresIn = 3600) => ({
  body: {
    requestSuccessful: true,
    responseMessage: "success",
    responseCode: "0",
    responseBody: { accessToken: "ACCESS.TOKEN.1", expiresIn },
  },
});

const ok = (responseBody: unknown) => ({
  body: { requestSuccessful: true, responseMessage: "success", responseCode: "0", responseBody },
});

function gatewayWith(fetchFn: ReturnType<typeof fakeFetch>, baseUrl = SANDBOX) {
  return new MonnifyGateway({ baseUrl, ...KEYS, fetch: fetchFn });
}

const call = (fetchFn: ReturnType<typeof fakeFetch>, i: number) => ({
  url: String(fetchFn.mock.calls[i]?.[0]),
  init: fetchFn.mock.calls[i]?.[1],
  headers: new Headers(fetchFn.mock.calls[i]?.[1]?.headers),
});

function expectNoSecrets(value: unknown) {
  const text = JSON.stringify(value, Object.getOwnPropertyNames(value ?? {})) + String(value);
  for (const secret of [KEYS.apiKey, KEYS.secretKey, "ACCESS.TOKEN.1"]) {
    expect(text).not.toContain(secret);
  }
}

const accountsBody = {
  accountReference: "user-1",
  reservationReference: "RES123",
  accounts: [
    { bankCode: "035", bankName: "Wema bank", accountNumber: "5000000001", accountName: "Ada" },
    { bankCode: "50515", bankName: "Moniepoint", accountNumber: "6000000001", accountName: "Ada" },
  ],
};

describe("authentication", () => {
  it("signs in with Basic api-key:secret-key, then uses the Bearer token", async () => {
    const fetchFn = fakeFetch(login(), ok(accountsBody));
    await gatewayWith(fetchFn).getReservedAccount("user-1");

    const signIn = call(fetchFn, 0);
    expect(signIn.url).toBe(`${SANDBOX}/api/v1/auth/login`);
    expect(signIn.init?.method).toBe("POST");
    expect(signIn.headers.get("authorization")).toBe(
      `Basic ${Buffer.from(`${KEYS.apiKey}:${KEYS.secretKey}`).toString("base64")}`,
    );
    expect(call(fetchFn, 1).headers.get("authorization")).toBe("Bearer ACCESS.TOKEN.1");
  });

  it("reuses the token until shortly before it expires", async () => {
    const fetchFn = fakeFetch(login(3600), ok(accountsBody), ok(accountsBody));
    const gateway = gatewayWith(fetchFn);
    await gateway.getReservedAccount("user-1");
    await gateway.getReservedAccount("user-1");
    expect(fetchFn).toHaveBeenCalledTimes(3); // one sign-in, two requests
  });

  it("throws a FundingGatewayError without secrets when sign-in is refused", async () => {
    const fetchFn = fakeFetch({
      status: 401,
      body: {
        requestSuccessful: false,
        responseMessage: "Invalid credentials",
        responseCode: "99",
      },
    });
    const error = await gatewayWith(fetchFn)
      .getReservedAccount("user-1")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FundingGatewayError);
    expectNoSecrets(error);
  });
});

describe("reserveAccount", () => {
  it("POSTs the v2 reserved-account request with the contract code and BVN", async () => {
    const fetchFn = fakeFetch(login(), ok(accountsBody));
    const result = await gatewayWith(fetchFn).reserveAccount({
      accountReference: "user-1",
      customerName: "Ada Obi",
      customerEmail: "ada@example.test",
      bvn: "22222222222",
    });

    const req = call(fetchFn, 1);
    expect(req.url).toBe(`${SANDBOX}/api/v2/bank-transfer/reserved-accounts`);
    expect(req.init?.method).toBe("POST");
    expect(JSON.parse(String(req.init?.body))).toEqual({
      accountReference: "user-1",
      accountName: "Ada Obi",
      currencyCode: "NGN",
      contractCode: KEYS.contractCode,
      customerEmail: "ada@example.test",
      customerName: "Ada Obi",
      bvn: "22222222222",
      getAllAvailableBanks: true,
    });
    expect(result.accounts).toEqual(accountsBody.accounts);
  });

  it("sends NIN instead of BVN when that's what the customer gave", async () => {
    const fetchFn = fakeFetch(login(), ok(accountsBody));
    await gatewayWith(fetchFn).reserveAccount({
      accountReference: "user-1",
      customerName: "Ada Obi",
      customerEmail: "ada@example.test",
      nin: "33333333333",
    });
    const body = JSON.parse(String(call(fetchFn, 1).init?.body));
    expect(body.nin).toBe("33333333333");
    expect(body.bvn).toBeUndefined();
  });

  it("refuses without an 11-digit BVN or NIN, before calling Monnify", async () => {
    const fetchFn = fakeFetch();
    await expect(
      gatewayWith(fetchFn).reserveAccount({
        accountReference: "user-1",
        customerName: "Ada",
        customerEmail: "a@example.test",
        bvn: "123",
      }),
    ).rejects.toThrow(TypeError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns the existing account when Monnify says the reference is already reserved", async () => {
    const fetchFn = fakeFetch(
      login(),
      {
        status: 422,
        body: {
          requestSuccessful: false,
          responseMessage: "You cannot reserve more than 1 account(s) for a customer",
          responseCode: "R42",
        },
      },
      ok(accountsBody),
    );
    const result = await gatewayWith(fetchFn).reserveAccount({
      accountReference: "user-1",
      customerName: "Ada",
      customerEmail: "a@example.test",
      bvn: "22222222222",
    });
    expect(call(fetchFn, 2).url).toBe(`${SANDBOX}/api/v2/bank-transfer/reserved-accounts/user-1`);
    expect(result.accounts).toHaveLength(2);
  });
});

describe("getReservedAccount", () => {
  it("returns null when Monnify has no such account", async () => {
    const fetchFn = fakeFetch(login(), {
      status: 404,
      body: { requestSuccessful: false, responseMessage: "Not found", responseCode: "99" },
    });
    expect(await gatewayWith(fetchFn).getReservedAccount("nobody")).toBeNull();
  });
});

describe("verifyPayment (asking Monnify directly)", () => {
  const tx = (overrides: Record<string, unknown> = {}) =>
    ok({
      transactionReference: "MNFY|20261114|000123",
      paymentReference: "MNFY|20261114|000123",
      amountPaid: "5000.00",
      totalPayable: "5000.00",
      settlementAmount: "4950.00",
      paidOn: "14/11/2026 10:00:00 AM",
      paymentStatus: "PAID",
      paymentMethod: "ACCOUNT_TRANSFER",
      product: { type: "RESERVED_ACCOUNT", reference: "user-1" },
      ...overrides,
    });

  it("GETs the v2 transaction with the reference URL-encoded, and converts to kobo", async () => {
    const fetchFn = fakeFetch(login(), tx());
    const payment = await gatewayWith(fetchFn).verifyPayment("MNFY|20261114|000123");

    expect(call(fetchFn, 1).url).toBe(
      `${SANDBOX}/api/v2/transactions/${encodeURIComponent("MNFY|20261114|000123")}`,
    );
    expect(payment).toMatchObject({
      transactionReference: "MNFY|20261114|000123",
      paid: true,
      status: "PAID",
      amountKobo: 500_000,
      accountReference: "user-1",
    });
  });

  it("accepts amounts sent as numbers", async () => {
    const fetchFn = fakeFetch(login(), tx({ amountPaid: 1234.5 }));
    expect((await gatewayWith(fetchFn).verifyPayment("r")).amountKobo).toBe(123_450);
  });

  it.each(["PENDING", "FAILED", "EXPIRED", "PARTIALLY_PAID"])(
    "is not paid when status is %s",
    async (paymentStatus) => {
      const fetchFn = fakeFetch(login(), tx({ paymentStatus }));
      expect((await gatewayWith(fetchFn).verifyPayment("r")).paid).toBe(false);
    },
  );

  it("has no account reference for payments that didn't go to a reserved account", async () => {
    const fetchFn = fakeFetch(
      login(),
      tx({ product: { type: "API_NOTIFICATION", reference: "x" } }),
    );
    expect((await gatewayWith(fetchFn).verifyPayment("r")).accountReference).toBeNull();
  });

  it("reports not paid (instead of failing) when Monnify says the transaction doesn't exist", async () => {
    const fetchFn = fakeFetch(login(), {
      status: 404,
      body: {
        requestSuccessful: false,
        responseMessage: "Could not find transaction",
        responseCode: "99",
      },
    });
    const payment = await gatewayWith(fetchFn).verifyPayment("MNFY|made-up");
    expect(payment).toMatchObject({ paid: false, status: "NOT_FOUND", amountKobo: 0 });
  });

  it("throws on a Monnify server error, so the webhook is retried later", async () => {
    const fetchFn = fakeFetch(login(), { status: 503, body: { requestSuccessful: false } });
    await expect(gatewayWith(fetchFn).verifyPayment("r")).rejects.toBeInstanceOf(
      FundingGatewayError,
    );
  });

  it("throws when Monnify can't answer, so nothing is credited", async () => {
    const fetchFn = fakeFetch(login(), new TypeError("fetch failed"));
    await expect(gatewayWith(fetchFn).verifyPayment("r")).rejects.toBeInstanceOf(
      FundingGatewayError,
    );
  });
});

describe("listAccountPayments", () => {
  it("lists recent transaction references for an account", async () => {
    const fetchFn = fakeFetch(
      login(),
      ok({ content: [{ transactionReference: "T1" }, { transactionReference: "T2" }, {}] }),
    );
    expect(await gatewayWith(fetchFn).listAccountPayments("user-1")).toEqual(["T1", "T2"]);
    expect(call(fetchFn, 1).url).toBe(
      `${SANDBOX}/api/v1/bank-transfer/reserved-accounts/transactions?accountReference=user-1&page=0&size=50`,
    );
  });
});

describe("webhooks", () => {
  const body = JSON.stringify({
    eventType: "SUCCESSFUL_TRANSACTION",
    eventData: { transactionReference: "MNFY|1", amountPaid: "5000.00" },
  });
  const sign = (raw: string, key = KEYS.secretKey) =>
    createHmac("sha512", key).update(raw).digest("hex");

  it("accepts a correct monnify-signature (HMAC-SHA512 of the raw body with the secret key)", () => {
    const check = gatewayWith(fakeFetch()).checkWebhookSignature(
      body,
      new Headers({ "monnify-signature": sign(body) }),
    );
    expect(check).toEqual({ ok: true, signed: true });
  });

  it("rejects a wrong signature, or one made with another key", () => {
    const gateway = gatewayWith(fakeFetch());
    expect(
      gateway.checkWebhookSignature(body, new Headers({ "monnify-signature": "abc" })).ok,
    ).toBe(false);
    expect(
      gateway.checkWebhookSignature(body, new Headers({ "monnify-signature": sign(body, "other") }))
        .ok,
    ).toBe(false);
    // A signature for a different body (e.g. amount edited after signing).
    expect(
      gateway.checkWebhookSignature(
        body.replace("5000.00", "500000.00"),
        new Headers({ "monnify-signature": sign(body) }),
      ).ok,
    ).toBe(false);
  });

  it("allows an unsigned webhook only in the sandbox (the payment is still re-checked with Monnify)", () => {
    expect(gatewayWith(fakeFetch()).checkWebhookSignature(body, new Headers())).toEqual({
      ok: true,
      signed: false,
    });
    expect(
      gatewayWith(fakeFetch(), "https://api.monnify.com").checkWebhookSignature(body, new Headers())
        .ok,
    ).toBe(false);
  });

  it("parses a successful-transaction event", () => {
    expect(gatewayWith(fakeFetch()).parseWebhook(body)).toEqual({
      kind: "payment",
      transactionReference: "MNFY|1",
    });
  });

  it("ignores other events and junk", () => {
    const gateway = gatewayWith(fakeFetch());
    expect(
      gateway.parseWebhook(JSON.stringify({ eventType: "SUCCESSFUL_DISBURSEMENT", eventData: {} }))
        .kind,
    ).toBe("ignored");
    expect(gateway.parseWebhook("not json").kind).toBe("ignored");
    expect(gateway.parseWebhook(JSON.stringify({ eventType: "SUCCESSFUL_TRANSACTION" })).kind).toBe(
      "ignored",
    );
  });
});

describe("secret handling", () => {
  it("doesn't expose keys when printed or serialised", () => {
    expectNoSecrets(gatewayWith(fakeFetch()));
  });
});

describe("createMonnifyGatewayFromEnv", () => {
  it("names missing settings without printing values", () => {
    const create = () =>
      createMonnifyGatewayFromEnv({ MONNIFY_BASE_URL: SANDBOX, MONNIFY_API_KEY: KEYS.apiKey });
    expect(create).toThrow(/MONNIFY_SECRET_KEY, MONNIFY_CONTRACT_CODE/);
    expect(create).not.toThrow(new RegExp(KEYS.apiKey));
  });

  it("builds a gateway from MONNIFY_* settings", () => {
    const gateway = createMonnifyGatewayFromEnv({
      MONNIFY_BASE_URL: SANDBOX,
      MONNIFY_API_KEY: KEYS.apiKey,
      MONNIFY_SECRET_KEY: KEYS.secretKey,
      MONNIFY_CONTRACT_CODE: KEYS.contractCode,
    });
    expect(gateway.name).toBe("monnify");
  });
});
