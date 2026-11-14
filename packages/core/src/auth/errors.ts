export type AuthErrorCode =
  | "invalid_destination"
  | "rate_limited"
  | "invalid_code"
  | "profile_invalid"
  | "email_taken"
  | "phone_taken"
  | "account_suspended"
  | "user_not_found"
  | "invalid_pin_format"
  | "weak_pin"
  | "pin_not_set"
  | "wrong_pin"
  | "pin_locked"
  | "current_pin_required";

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  /** For rate_limited: seconds until another code can be requested. */
  readonly retryAfterSeconds?: number;
  /** For wrong_pin: tries left before the PIN locks. */
  readonly attemptsRemaining?: number;

  constructor(
    code: AuthErrorCode,
    message: string,
    details: { retryAfterSeconds?: number; attemptsRemaining?: number } = {},
  ) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    if (details.retryAfterSeconds !== undefined) this.retryAfterSeconds = details.retryAfterSeconds;
    if (details.attemptsRemaining !== undefined) this.attemptsRemaining = details.attemptsRemaining;
  }
}
