// Shared JSON helpers for API routes.
import { adminErrorResponse, authErrorResponse, purchaseErrorResponse } from "@repo/core";

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
  const known =
    authErrorResponse(error) ?? purchaseErrorResponse(error) ?? adminErrorResponse(error);
  if (known) return Response.json(known.body, { status: known.status, headers: known.headers });
  console.error(`${context} failed`, error);
  return Response.json(
    { error: { code: "server_error", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}

export const str = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/** ?limit=&offset= from the URL (the core clamps them to safe bounds). */
export function pageFrom(url: URL): { limit?: number; offset?: number } {
  const num = (name: string) => {
    const value = Number(url.searchParams.get(name));
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  return { limit: num("limit"), offset: num("offset") };
}

const STATUSES = ["pending", "success", "failed"] as const;
export type OrderStatus = (typeof STATUSES)[number];

export function orderStatusFrom(url: URL): OrderStatus | undefined {
  const value = url.searchParams.get("status");
  return STATUSES.find((s) => s === value);
}

export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
