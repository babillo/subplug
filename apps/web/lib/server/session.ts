// Who is signed in, for API routes.
// - Web: the session token is in an HttpOnly cookie (page scripts can't read it).
// - Mobile: the app sends "Authorization: Bearer <token>".
// Cookie-signed-in requests that change something must come from our own site (Origin check), so
// another website can't submit forms on the customer's behalf.
import type { User } from "@repo/core";

import { getServices } from "./services";

export const SESSION_COOKIE = "session";

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

function cookieToken(request: Request): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** True when a cookie-authenticated, state-changing request comes from another site. */
function isCrossSite(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false; // non-browser clients don't send Origin; browsers always do on POST
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}

/** The session token sent with the request (header first, then cookie), if any. */
export function getSessionToken(
  request: Request,
): { token: string; via: "header" | "cookie" } | null {
  const header = bearerToken(request);
  if (header) return { token: header, via: "header" };
  const cookie = cookieToken(request);
  return cookie ? { token: cookie, via: "cookie" } : null;
}

/** The signed-in user, or null. */
export async function getSignedInUser(request: Request): Promise<User | null> {
  const session = getSessionToken(request);
  if (!session) return null;
  if (session.via === "cookie" && isCrossSite(request)) return null;
  return getServices().auth().getSessionUser(session.token);
}

export function unauthorized(): Response {
  return Response.json(
    { error: { code: "unauthorized", message: "Please sign in." } },
    { status: 401 },
  );
}

/** Set-Cookie value for a new session. Secure in production (HTTPS only). */
export function sessionCookie(token: string, expiresAt: Date): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`;
}

export function clearedSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/** What the API tells the app about the signed-in user (never the PIN hash). */
export function userView(user: User) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    tier: user.tier,
    hasPin: user.pinHash !== null,
    pinLocked: user.pinLockedAt !== null,
  };
}
