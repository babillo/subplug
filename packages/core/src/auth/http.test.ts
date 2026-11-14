import { describe, expect, it } from "vitest";

import { AuthError, type AuthErrorCode } from "./errors.ts";
import { authErrorResponse } from "./http.ts";

describe("authErrorResponse", () => {
  it.each<[AuthErrorCode, number]>([
    ["invalid_destination", 400],
    ["invalid_code", 400],
    ["profile_invalid", 400],
    ["invalid_pin_format", 400],
    ["weak_pin", 400],
    ["current_pin_required", 400],
    ["email_taken", 409],
    ["phone_taken", 409],
    ["pin_not_set", 409],
    ["account_suspended", 403],
    ["wrong_pin", 403],
    ["user_not_found", 404],
    ["pin_locked", 423],
  ])("maps %s to HTTP %s", (code, status) => {
    expect(authErrorResponse(new AuthError(code, "message"))?.status).toBe(status);
  });

  it("maps rate limits to 429 with Retry-After", () => {
    const res = authErrorResponse(new AuthError("rate_limited", "wait", { retryAfterSeconds: 42 }));
    expect(res).toMatchObject({
      status: 429,
      headers: { "Retry-After": "42" },
      body: { error: { code: "rate_limited", retryAfterSeconds: 42 } },
    });
  });

  it("tells the customer how many PIN tries are left", () => {
    const res = authErrorResponse(
      new AuthError("wrong_pin", "Wrong PIN", { attemptsRemaining: 3 }),
    );
    expect(res?.body.error).toMatchObject({ code: "wrong_pin", attemptsRemaining: 3 });
  });

  it("returns null for other errors", () => {
    expect(authErrorResponse(new Error("boom"))).toBeNull();
  });
});
