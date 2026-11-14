// Calls our backend. The app never talks to VTpass or Monnify: the server holds those keys.
import type { ApiErrorBody } from "@repo/shared/api";

import { API_URL } from "./config";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly retryAfterSeconds?: number;
  readonly attemptsRemaining?: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message ?? "Something went wrong. Please try again.");
    this.status = status;
    this.code = body.code ?? "error";
    this.fields = body.fields;
    this.retryAfterSeconds = body.retryAfterSeconds;
    this.attemptsRemaining = body.attemptsRemaining;
  }
}

let token: string | null = null;
let onSignedOut: (() => void) | null = null;

/** Set by the auth provider: the token to send, and what to do when the server rejects it. */
export function configureApi(options: { token: string | null; onSignedOut?: () => void }) {
  token = options.token;
  if (options.onSignedOut) onSignedOut = options.onSignedOut;
}

/** GET when there is no body, POST (JSON) when there is one. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Accept: "application/json",
        // Tells the server to return the sign-in token in the body instead of a cookie.
        "x-client": "mobile",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "omit",
    });
  } catch {
    throw new ApiError(0, {
      code: "offline",
      message: "Can’t reach the server. Check your internet connection.",
    });
  }
  const data = (await response.json().catch(() => ({}))) as { error?: ApiErrorBody };
  if (response.status === 401 && token) onSignedOut?.();
  if (!response.ok) throw new ApiError(response.status, data.error ?? {});
  return data as T;
}
