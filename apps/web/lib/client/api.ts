// Calls our own API from the browser. The session cookie goes along automatically.
"use client";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly retryAfterSeconds?: number;
  readonly attemptsRemaining?: number;

  constructor(
    status: number,
    body: {
      code?: string;
      message?: string;
      fields?: Record<string, string>;
      retryAfterSeconds?: number;
      attemptsRemaining?: number;
    },
  ) {
    super(body.message ?? "Something went wrong. Please try again.");
    this.status = status;
    this.code = body.code ?? "error";
    this.fields = body.fields;
    this.retryAfterSeconds = body.retryAfterSeconds;
    this.attemptsRemaining = body.attemptsRemaining;
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, {
      code: "offline",
      message: "Can't reach the server. Check your connection.",
    });
  }
  const data = (await response.json().catch(() => ({}))) as {
    error?: ConstructorParameters<typeof ApiError>[1];
  };
  if (!response.ok) throw new ApiError(response.status, data.error ?? {});
  return data as T;
}
