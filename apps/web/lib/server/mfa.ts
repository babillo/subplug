// Shared bits for the two-step sign-in routes.
import { MfaError } from "@repo/core";

const STATUS: Record<MfaError["code"], number> = {
  invalid_code: 400,
  already_enabled: 409,
  not_started: 409,
  not_enrolled: 409,
};

/** Maps two-step errors to HTTP; null for anything else. */
export function mfaErrorResponse(error: unknown): Response | null {
  if (!(error instanceof MfaError)) return null;
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: STATUS[error.code] },
  );
}
