// Turns sign-in and PIN errors into HTTP responses with customer-friendly messages.
import type { ErrorResponse } from "../orders/http.ts";
import { AuthError, type AuthErrorCode } from "./errors.ts";

const STATUS: Record<AuthErrorCode, number> = {
  invalid_destination: 400,
  invalid_code: 400,
  profile_invalid: 400,
  invalid_pin_format: 400,
  weak_pin: 400,
  current_pin_required: 400,
  email_taken: 409,
  phone_taken: 409,
  pin_not_set: 409,
  account_suspended: 403,
  wrong_pin: 403,
  user_not_found: 404,
  pin_locked: 423,
  rate_limited: 429,
};

export function authErrorResponse(
  error: unknown,
): (ErrorResponse & { body: { error: { attemptsRemaining?: number } } }) | null {
  if (!(error instanceof AuthError)) return null;
  return {
    status: STATUS[error.code],
    ...(error.retryAfterSeconds !== undefined
      ? { headers: { "Retry-After": String(error.retryAfterSeconds) } }
      : {}),
    body: {
      error: {
        code: error.code,
        message: error.message,
        ...(error.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: error.retryAfterSeconds }
          : {}),
        ...(error.attemptsRemaining !== undefined
          ? { attemptsRemaining: error.attemptsRemaining }
          : {}),
      },
    },
  };
}
