// Applies the rate limits from @repo/core to API routes.
import { hitRateLimit, type RateLimitRule, rateLimitMessage } from "@repo/core";

import { getServices } from "./services";

/**
 * The visitor's internet address. In production we run behind Cloudflare, which sets
 * `cf-connecting-ip` itself (visitors can't fake it). Without Cloudflare (the laptop) we fall
 * back to the forwarded address, or one shared "local" bucket.
 */
export function clientIp(request: Request): string {
  const cloudflare = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;
  if (process.env.NODE_ENV === "production") return "unknown";
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/**
 * Counts this request against `rule` for `key`. Returns a ready 429 response when over the
 * limit, or null to carry on. Usage:
 *   const limited = await rateLimited(`otp:ip:${clientIp(request)}`, RATE_LIMITS.otpPerIp);
 *   if (limited) return limited;
 */
export async function rateLimited(key: string, rule: RateLimitRule): Promise<Response | null> {
  const result = await hitRateLimit(getServices().db, key, rule);
  if (result.allowed) return null;
  return Response.json(
    {
      error: {
        code: "rate_limited",
        message: rateLimitMessage(result.retryAfterSeconds),
        retryAfterSeconds: result.retryAfterSeconds,
      },
    },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
  );
}
