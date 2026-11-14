// Shared JSON helpers for API routes.
import { authErrorResponse, purchaseErrorResponse } from "@repo/core";

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function badRequest(message: string, fields?: Record<string, string>): Response {
  return Response.json(
    { error: { code: "invalid_input", message, ...(fields ? { fields } : {}) } },
    { status: 400 },
  );
}

/** Known auth/purchase errors → their HTTP answer; anything else → logged 500. */
export function errorResponse(error: unknown, context: string): Response {
  const known = authErrorResponse(error) ?? purchaseErrorResponse(error);
  if (known) return Response.json(known.body, { status: known.status, headers: known.headers });
  console.error(`${context} failed`, error);
  return Response.json(
    { error: { code: "server_error", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}

export const str = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
