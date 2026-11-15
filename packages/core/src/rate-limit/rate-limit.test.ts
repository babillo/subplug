// Rate limits: counted in the database so they hold across server instances and restarts.
import { type Database, schema } from "@repo/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hasTestDatabase, openTestDb, resetDatabase } from "../test/db.ts";
import { cleanupRateLimits, hitRateLimit, RATE_LIMITS, rateLimitMessage } from "./rate-limit.ts";

describe("rateLimitMessage", () => {
  it.each([
    [20, "Too many attempts. Please try again in 20 seconds."],
    [1, "Too many attempts. Please try again in 1 second."],
    [61, "Too many attempts. Please try again in 2 minutes."],
    [3600, "Too many attempts. Please try again in 60 minutes."],
    [3601, "Too many attempts. Please try again in 2 hours."],
  ])("%s seconds → %s", (seconds, message) => {
    expect(rateLimitMessage(seconds)).toBe(message);
  });
});

describe("RATE_LIMITS", () => {
  it("are all positive whole numbers", () => {
    for (const rule of Object.values(RATE_LIMITS)) {
      expect(Number.isInteger(rule.limit) && rule.limit > 0).toBe(true);
      expect(Number.isInteger(rule.windowSeconds) && rule.windowSeconds > 0).toBe(true);
    }
  });
});

describe.skipIf(!hasTestDatabase)("hitRateLimit (real PostgreSQL)", { timeout: 60_000 }, () => {
  let db: Database;
  let close: () => Promise<void>;
  beforeAll(() => {
    ({ db, close } = openTestDb());
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await resetDatabase(db);
  });

  const rule = { limit: 3, windowSeconds: 60 };
  // 10:00:15 UTC: 15 seconds into a one-minute window.
  const now = new Date("2026-11-15T10:00:15Z");

  it("allows up to the limit, then refuses with how long to wait", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await hitRateLimit(db, "test:a", rule, now));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(results[0]).toMatchObject({ allowed: true, retryAfterSeconds: 0 });
    expect(results[3]).toMatchObject({ allowed: false, retryAfterSeconds: 45 });
  });

  it("counts each key separately", async () => {
    for (let i = 0; i < 3; i++) await hitRateLimit(db, "test:a", rule, now);
    expect((await hitRateLimit(db, "test:a", rule, now)).allowed).toBe(false);
    expect((await hitRateLimit(db, "test:b", rule, now)).allowed).toBe(true);
  });

  it("starts fresh in the next window", async () => {
    for (let i = 0; i < 4; i++) await hitRateLimit(db, "test:a", rule, now);
    const later = new Date("2026-11-15T10:01:00Z");
    expect((await hitRateLimit(db, "test:a", rule, later)).allowed).toBe(true);
  });

  it("lets exactly `limit` through when many requests arrive at the same moment", async () => {
    const big = { limit: 10, windowSeconds: 60 };
    const results = await Promise.all(
      Array.from({ length: 25 }, () => hitRateLimit(db, "test:burst", big, now)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    const [row] = await db.select().from(schema.rateLimits);
    expect(row).toMatchObject({ key: "test:burst", count: 25 });
  });

  it("clean-up removes old windows and keeps current ones", async () => {
    await hitRateLimit(db, "test:old", rule, new Date("2026-11-12T10:00:00Z"));
    await hitRateLimit(db, "test:new", rule, now);
    const removed = await cleanupRateLimits(db, now);
    expect(removed).toBe(1);
    const rows = await db.select().from(schema.rateLimits);
    expect(rows.map((r) => r.key)).toEqual(["test:new"]);
  });
});
