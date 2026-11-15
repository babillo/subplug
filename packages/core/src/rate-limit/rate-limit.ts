// Rate limits, counted in our own database (no extra service): each request adds 1 to a counter
// for "this key in this time window" in one atomic statement, so a burst of simultaneous requests
// can't slip past the limit. Works the same on the laptop and on Cloudflare.
import { type DbOrTx, schema } from "@repo/db";
import { lt, sql } from "drizzle-orm";

const { rateLimits } = schema;

export interface RateLimitRule {
  /** How many requests are allowed per window. */
  limit: number;
  windowSeconds: number;
}

/**
 * The limits. Placeholders to tune with real traffic: the one place to change them.
 * The per-number/per-email limits on sign-in codes (1 a minute, 5 an hour) live in auth.
 */
export const RATE_LIMITS = {
  /** Sign-in codes requested from one internet address (stops SMS-cost abuse). */
  otpPerIp: { limit: 10, windowSeconds: 60 * 60 },
  /** Sign-in attempts (code checks) from one internet address. */
  signInPerIp: { limit: 20, windowSeconds: 10 * 60 },
  /** Purchases by one customer. */
  ordersPerUser: { limit: 10, windowSeconds: 60 },
  /** Creating funding accounts (each one calls Monnify) by one customer. */
  fundingAccountsPerUser: { limit: 5, windowSeconds: 24 * 60 * 60 },
  /** Changes made by one admin. */
  adminActionsPerAdmin: { limit: 60, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  /** Requests counted in this window so far, including this one. */
  count: number;
  /** When refused: seconds until the window resets. 0 when allowed. */
  retryAfterSeconds: number;
}

/** Counts one request for `key` (e.g. "otp:ip:203.0.113.5") and says whether it is allowed. */
export async function hitRateLimit(
  db: DbOrTx,
  key: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  const count = row!.count;
  const allowed = count <= rule.limit;
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000));
  return { allowed, count, retryAfterSeconds };
}

/** Deletes counters from windows that started over a day ago (longest window is one day). */
export async function cleanupRateLimits(db: DbOrTx, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, cutoff))
    .returning({ key: rateLimits.key });
  return deleted.length;
}

/** "Too many attempts. Please try again in 3 minutes." */
export function rateLimitMessage(retryAfterSeconds: number): string {
  const s = Math.max(1, Math.ceil(retryAfterSeconds));
  const wait =
    s < 60
      ? `${s} second${s === 1 ? "" : "s"}`
      : s <= 3600
        ? `${Math.ceil(s / 60)} minutes`
        : `${Math.ceil(s / 3600)} hours`;
  return `Too many attempts. Please try again in ${wait}.`;
}
