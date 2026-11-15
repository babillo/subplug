// Who is signed in, for API routes.
// - Web: the session token is in an HttpOnly cookie (page scripts can't read it).
// - Mobile: the app sends "Authorization: Bearer <token>".
// Cookie-signed-in requests that change something must come from our own site (Origin check), so
// another website can't submit forms on the customer's behalf.
import { RATE_LIMITS, type User } from "@repo/core";

import { rateLimited } from "./rate-limit";
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

/**
 * True when a cookie-authenticated, state-changing request comes from another site.
 * The browser's Origin must match the address the browser sent the request to: the Host header
 * (set by the browser; another site can't change it) or the server's own URL. Behind Cloudflare
 * the URL the server sees can differ from the public one, hence the Host header too.
 */
function isCrossSite(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false; // non-browser clients don't send Origin; browsers always do on POST
  try {
    const originHost = new URL(origin).host;
    const ourHosts = [new URL(request.url).host, request.headers.get("host")].filter(Boolean);
    return !ourHosts.includes(originHost);
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
  return (await getSignedInSession(request))?.user ?? null;
}

/** The signed-in user and their session id, or null. */
export async function getSignedInSession(
  request: Request,
): Promise<{ user: User; sessionId: string } | null> {
  const session = getSessionToken(request);
  if (!session) return null;
  if (session.via === "cookie" && isCrossSite(request)) return null;
  return getServices().auth().getSession(session.token);
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

/**
 * A signed-in admin who may not have passed two-step sign-in yet: only for the two-step routes
 * themselves (setting it up, entering a code). Everything else uses requireAdmin.
 */
export async function requireAdminSignedIn(
  request: Request,
): Promise<{ user: User; sessionId: string } | Response> {
  const signedIn = await getSignedInSession(request);
  if (!signedIn) return unauthorized();
  if (signedIn.user.role !== "admin") {
    return Response.json(
      { error: { code: "forbidden", message: "Admins only." } },
      { status: 403 },
    );
  }
  return signedIn;
}

/**
 * The signed-in admin, or a ready-made 401/403/429 response. Admins must also have passed
 * two-step sign-in on this session in the last 12 hours. Usage:
 *   const admin = await requireAdmin(request); if (admin instanceof Response) return admin;
 */
export async function requireAdmin(request: Request): Promise<User | Response> {
  const signedIn = await requireAdminSignedIn(request);
  if (signedIn instanceof Response) return signedIn;
  const { user, sessionId } = signedIn;
  const mfa = await getServices().adminMfa().status(user.id, sessionId);
  if (!mfa.verified) {
    return Response.json(
      {
        error: {
          code: "mfa_required",
          message: mfa.enrolled
            ? "Enter the code from your authenticator app at /admin first."
            : "Set up two-step sign-in at /admin first.",
        },
      },
      { status: 403 },
    );
  }
  // Changes (not page views) are limited per admin, so a stolen session can't make thousands.
  if (request.method !== "GET") {
    const limited = await rateLimited(`admin:user:${user.id}`, RATE_LIMITS.adminActionsPerAdmin);
    if (limited) return limited;
  }
  return user;
}
