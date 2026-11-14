import { describe, expect, it } from "vitest";

import { classifyVtpassResponse } from "./status-map.ts";

const tx = (status: string) => ({
  code: "000",
  response_description: "TRANSACTION SUCCESSFUL",
  content: { transactions: { status } },
});

const purchase = (body: unknown, httpStatus = 200) =>
  classifyVtpassResponse({ operation: "purchase", httpStatus, body }).status;
const requery = (body: unknown, httpStatus = 200) =>
  classifyVtpassResponse({ operation: "requery", httpStatus, body }).status;

describe("classifyVtpassResponse: success", () => {
  it("is success only for code 000 with status delivered", () => {
    expect(purchase(tx("delivered"))).toBe("success");
    expect(requery(tx("delivered"))).toBe("success");
    expect(purchase(tx("DELIVERED"))).toBe("success");
  });
});

describe("classifyVtpassResponse: pending (ask again later, never refund yet)", () => {
  it("treats 000 with pending or initiated status as pending", () => {
    expect(purchase(tx("pending"))).toBe("pending");
    expect(purchase(tx("initiated"))).toBe("pending");
  });

  it("treats 000 with a missing or unknown status as pending", () => {
    expect(purchase({ code: "000" })).toBe("pending");
    expect(purchase(tx("something-new"))).toBe("pending");
  });

  it.each(["099", "089", "001", "044", "083", "014"])("treats code %s as pending", (code) => {
    expect(purchase({ code })).toBe("pending");
  });

  it("treats unknown codes as pending", () => {
    expect(purchase({ code: "777" })).toBe("pending");
  });

  it("treats odd bodies and server errors as pending", () => {
    expect(purchase(null)).toBe("pending");
    expect(purchase("<html>Bad gateway</html>", 502)).toBe("pending");
    expect(purchase({}, 500)).toBe("pending");
    expect(purchase([])).toBe("pending");
  });

  it("treats 015 (unknown request_id) as pending on purchase", () => {
    expect(purchase({ code: "015" })).toBe("pending");
  });
});

describe("classifyVtpassResponse: failed (safe to refund)", () => {
  it.each(["016", "040", "091"])("treats code %s as failed", (code) => {
    expect(purchase({ code })).toBe("failed");
    expect(requery({ code })).toBe("failed");
  });

  it.each([
    "010",
    "011",
    "012",
    "013",
    "017",
    "018",
    "019",
    "021",
    "022",
    "023",
    "024",
    "027",
    "028",
    "030",
    "031",
    "032",
    "034",
    "035",
    "085",
    "087",
  ])("treats rejected-before-processing code %s as failed", (code) => {
    expect(purchase({ code })).toBe("failed");
  });

  it("treats 000 with failed or reversed status as failed", () => {
    expect(purchase(tx("failed"))).toBe("failed");
    expect(requery(tx("reversed"))).toBe("failed");
  });

  it("treats 015 on requery as failed: VTpass never received that request_id", () => {
    expect(requery({ code: "015" })).toBe("failed");
  });

  it("treats HTTP 401/403 (credentials rejected) as failed", () => {
    expect(purchase("Invalid Credentials.", 401)).toBe("failed");
    expect(purchase({ message: "Forbidden" }, 403)).toBe("failed");
  });
});

describe("classifyVtpassResponse: details", () => {
  it("returns the provider code and description for logging", () => {
    const result = classifyVtpassResponse({
      operation: "purchase",
      httpStatus: 200,
      body: { code: "016", response_description: "TRANSACTION FAILED" },
    });
    expect(result).toEqual({
      status: "failed",
      providerCode: "016",
      message: "TRANSACTION FAILED",
    });
  });

  it("reads `message` when VTpass sends it instead of response_description", () => {
    // Real sandbox reply to invalid keys: HTTP 401 {"code":"087","message":"INVALID CREDENTIALS"}
    expect(
      classifyVtpassResponse({
        operation: "purchase",
        httpStatus: 200,
        body: { code: "087", message: "INVALID CREDENTIALS" },
      }),
    ).toEqual({ status: "failed", providerCode: "087", message: "INVALID CREDENTIALS" });
  });

  it("accepts numeric codes", () => {
    expect(purchase({ code: 16 })).toBe("failed");
  });
});
