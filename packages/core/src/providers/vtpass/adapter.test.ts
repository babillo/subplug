import { describe, expect, it, vi } from "vitest";

import { ProviderError } from "../types.ts";
import { createVtpassAdapterFromEnv, VtpassAdapter } from "./adapter.ts";

const BASE = "https://sandbox.vtpass.com/api";
const KEYS = {
  apiKey: "test-api-key-123",
  publicKey: "PK_test_public",
  secretKey: "SK_test_secret",
};

type FakeResponse = { status?: number; body: unknown } | Error;

/** A fake fetch that records calls and returns the queued responses in order. */
function fakeFetch(...responses: FakeResponse[]) {
  const fn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error("fakeFetch: no response queued");
    if (next instanceof Error) throw next;
    const text = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
    return new Response(text, { status: next.status ?? 200 });
  });
  return fn;
}

function adapterWith(fetchFn: ReturnType<typeof fakeFetch>) {
  return new VtpassAdapter({ baseUrl: BASE, ...KEYS, fetch: fetchFn, timeoutMs: 1000 });
}

function headersOf(fetchFn: ReturnType<typeof fakeFetch>, call = 0) {
  return new Headers(fetchFn.mock.calls[call]?.[1]?.headers);
}

/** Fails if any secret appears anywhere in a value (results, errors, raw responses). */
function expectNoSecrets(value: unknown) {
  const text = JSON.stringify(value, Object.getOwnPropertyNames(value ?? {})) + String(value);
  for (const secret of Object.values(KEYS)) expect(text).not.toContain(secret);
}

const delivered = {
  code: "000",
  response_description: "TRANSACTION SUCCESSFUL",
  requestId: "202611141005abcdefghijkl",
  amount: 100,
  content: {
    transactions: {
      status: "delivered",
      product_name: "MTN Airtime VTU",
      unique_element: "08011111111",
      amount: 100,
      total_amount: 97,
      transactionId: "17311234567890",
    },
  },
};

const order = {
  requestId: "202611141005abcdefghijkl",
  serviceId: "mtn",
  recipientPhone: "08011111111",
  amountKobo: 10_000,
};

describe("VtpassAdapter.getBalance", () => {
  it("calls GET /balance with api-key + public-key and returns kobo", async () => {
    const fetchFn = fakeFetch({ body: { code: 1, contents: { balance: 1081.8199999998 } } });
    const result = await adapterWith(fetchFn).getBalance();

    expect(fetchFn.mock.calls[0]?.[0]).toBe(`${BASE}/balance`);
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe("GET");
    const headers = headersOf(fetchFn);
    expect(headers.get("api-key")).toBe(KEYS.apiKey);
    expect(headers.get("public-key")).toBe(KEYS.publicKey);
    expect(headers.get("secret-key")).toBeNull();
    expect(result.balanceKobo).toBe(108_182);
    expect(result.raw).toEqual({ code: 1, contents: { balance: 1081.8199999998 } });
  });

  it("throws a ProviderError without secrets when credentials are rejected", async () => {
    const fetchFn = fakeFetch({ status: 401, body: "Invalid Credentials." });
    const error = await adapterWith(fetchFn)
      .getBalance()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).httpStatus).toBe(401);
    expectNoSecrets(error);
  });

  it("throws a ProviderError on network failure", async () => {
    const fetchFn = fakeFetch(new TypeError("fetch failed"));
    await expect(adapterWith(fetchFn).getBalance()).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("VtpassAdapter.getVariations", () => {
  it("calls GET /service-variations and normalises plans to kobo", async () => {
    const fetchFn = fakeFetch({
      body: {
        response_description: "000",
        content: {
          ServiceName: "MTN Data",
          serviceID: "mtn-data",
          variations: [
            {
              variation_code: "mtn-10mb-100",
              name: "N100 100MB - 24 hrs",
              variation_amount: "100.00",
              fixedPrice: "Yes",
            },
            {
              variation_code: "mtn-flex",
              name: "Flexible",
              variation_amount: "0.00",
              fixedPrice: "No",
            },
          ],
        },
      },
    });
    const result = await adapterWith(fetchFn).getVariations("mtn-data");

    expect(fetchFn.mock.calls[0]?.[0]).toBe(`${BASE}/service-variations?serviceID=mtn-data`);
    expect(headersOf(fetchFn).get("public-key")).toBe(KEYS.publicKey);
    expect(result.serviceName).toBe("MTN Data");
    expect(result.variations).toEqual([
      { code: "mtn-10mb-100", name: "N100 100MB - 24 hrs", priceKobo: 10_000, fixedPrice: true },
      { code: "mtn-flex", name: "Flexible", priceKobo: 0, fixedPrice: false },
    ]);
  });

  it("falls back to VTpass's misspelled `varations` key", async () => {
    const fetchFn = fakeFetch({
      body: {
        content: {
          varations: [
            { variation_code: "a", name: "A", variation_amount: "50", fixedPrice: "Yes" },
          ],
        },
      },
    });
    const result = await adapterWith(fetchFn).getVariations("glo-data");
    expect(result.variations.map((v) => v.code)).toEqual(["a"]);
  });

  it("URL-encodes the service id", async () => {
    const fetchFn = fakeFetch({ body: { content: { variations: [] } } });
    await adapterWith(fetchFn).getVariations("a b&c");
    expect(fetchFn.mock.calls[0]?.[0]).toBe(`${BASE}/service-variations?serviceID=a+b%26c`);
  });

  it("throws a ProviderError when the response has no plan list", async () => {
    const fetchFn = fakeFetch({
      body: { code: "012", response_description: "PRODUCT DOES NOT EXIST" },
    });
    await expect(adapterWith(fetchFn).getVariations("nope")).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("VtpassAdapter.purchase", () => {
  it("POSTs /pay with api-key + secret-key and the VTpass body", async () => {
    const fetchFn = fakeFetch({ body: delivered });
    await adapterWith(fetchFn).purchase({
      ...order,
      serviceId: "mtn-data",
      variationCode: "mtn-10mb-100",
    });

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE}/pay`);
    expect(init?.method).toBe("POST");
    const headers = headersOf(fetchFn);
    expect(headers.get("api-key")).toBe(KEYS.apiKey);
    expect(headers.get("secret-key")).toBe(KEYS.secretKey);
    expect(headers.get("public-key")).toBeNull();
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      request_id: order.requestId,
      serviceID: "mtn-data",
      billersCode: "08011111111",
      variation_code: "mtn-10mb-100",
      amount: 100,
      phone: "08011111111",
    });
  });

  it("returns success with the provider reference and charged amount", async () => {
    const result = await adapterWith(fakeFetch({ body: delivered })).purchase(order);
    expect(result).toMatchObject({
      status: "success",
      requestId: order.requestId,
      providerCode: "000",
      providerReference: "17311234567890",
      providerAmountKobo: 9_700,
    });
    expect(result.raw).toEqual(delivered);
    expectNoSecrets(result);
  });

  it("returns pending when VTpass says the transaction is pending", async () => {
    const body = {
      ...delivered,
      content: { transactions: { ...delivered.content.transactions, status: "pending" } },
    };
    const result = await adapterWith(fakeFetch({ body })).purchase(order);
    expect(result.status).toBe("pending");
  });

  it("returns pending on code 099 (still processing)", async () => {
    const result = await adapterWith(fakeFetch({ body: { code: "099" } })).purchase(order);
    expect(result.status).toBe("pending");
  });

  it("returns failed on code 016 (transaction failed)", async () => {
    const result = await adapterWith(
      fakeFetch({ body: { code: "016", response_description: "TRANSACTION FAILED" } }),
    ).purchase(order);
    expect(result).toMatchObject({
      status: "failed",
      providerCode: "016",
      message: "TRANSACTION FAILED",
    });
  });

  it("returns failed when credentials are rejected (HTTP 401)", async () => {
    const result = await adapterWith(
      fakeFetch({ status: 401, body: "Invalid Credentials." }),
    ).purchase(order);
    expect(result.status).toBe("failed");
    expectNoSecrets(result);
  });

  it("returns pending, never failed, on a network error (VTpass may have charged)", async () => {
    const result = await adapterWith(fakeFetch(new TypeError("fetch failed"))).purchase(order);
    expect(result.status).toBe("pending");
    expect(result.raw).toMatchObject({ error: "network" });
    expectNoSecrets(result);
  });

  it("returns pending on a timeout", async () => {
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    const result = await adapterWith(fakeFetch(timeout)).purchase(order);
    expect(result.status).toBe("pending");
    expect(result.raw).toMatchObject({ error: "timeout" });
  });

  it("returns pending on a 502 with an HTML body", async () => {
    const result = await adapterWith(
      fakeFetch({ status: 502, body: "<html>Bad gateway</html>" }),
    ).purchase(order);
    expect(result.status).toBe("pending");
    expect(result.raw).toBe("<html>Bad gateway</html>");
  });

  it("refuses amounts with leftover kobo before calling VTpass", async () => {
    const fetchFn = fakeFetch({ body: delivered });
    await expect(adapterWith(fetchFn).purchase({ ...order, amountKobo: 10_050 })).rejects.toThrow(
      RangeError,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses a malformed request_id before calling VTpass", async () => {
    const fetchFn = fakeFetch({ body: delivered });
    await expect(adapterWith(fetchFn).purchase({ ...order, requestId: "abc" })).rejects.toThrow(
      TypeError,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("VtpassAdapter.requery", () => {
  it("POSTs /requery with the request_id and maps the result", async () => {
    const fetchFn = fakeFetch({ body: delivered });
    const result = await adapterWith(fetchFn).requery(order.requestId);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(`${BASE}/requery`);
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      request_id: order.requestId,
    });
    expect(headersOf(fetchFn).get("secret-key")).toBe(KEYS.secretKey);
    expect(result.status).toBe("success");
  });

  it("returns failed on 015: VTpass never received this request_id", async () => {
    const result = await adapterWith(fakeFetch({ body: { code: "015" } })).requery(order.requestId);
    expect(result.status).toBe("failed");
  });

  it("returns pending on a network error", async () => {
    const result = await adapterWith(fakeFetch(new TypeError("fetch failed"))).requery(
      order.requestId,
    );
    expect(result.status).toBe("pending");
  });
});

describe("secret handling", () => {
  it("does not expose keys when the adapter is printed or serialised", () => {
    const adapter = adapterWith(fakeFetch());
    expectNoSecrets(adapter);
    expect(JSON.stringify(adapter)).not.toContain("SK_");
  });
});

describe("createVtpassAdapterFromEnv", () => {
  it("builds an adapter from VTPASS_* variables", () => {
    const adapter = createVtpassAdapterFromEnv({
      VTPASS_BASE_URL: BASE,
      VTPASS_API_KEY: KEYS.apiKey,
      VTPASS_PUBLIC_KEY: KEYS.publicKey,
      VTPASS_SECRET_KEY: KEYS.secretKey,
    });
    expect(adapter.name).toBe("vtpass");
  });

  it("names the missing variables without printing any values", () => {
    const create = () =>
      createVtpassAdapterFromEnv({ VTPASS_BASE_URL: BASE, VTPASS_API_KEY: KEYS.apiKey });
    expect(create).toThrow(/VTPASS_PUBLIC_KEY, VTPASS_SECRET_KEY/);
    expect(create).not.toThrow(new RegExp(KEYS.apiKey));
  });
});
