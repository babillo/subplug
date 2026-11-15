// Monitoring: background jobs, saved server errors and the admin System page's numbers.
import { type Database, schema } from "@repo/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FakeGateway } from "../test/fake-gateway.ts";
import { FakeProvider } from "../test/fake-provider.ts";
import { hasTestDatabase, openTestDb, resetDatabase } from "../test/db.ts";
import { credit } from "../wallet/wallet.ts";
import { listRecentErrors, recordError } from "./errors.ts";
import { JOBS, jobsDueAt, runJobs } from "./jobs.ts";
import { getSystemStatus } from "./status.ts";

class RichProvider extends FakeProvider {
  balanceKobo = 10_000_000; // ₦100,000
  balanceError: Error | null = null;
  override async getBalance() {
    if (this.balanceError) throw this.balanceError;
    return { balanceKobo: this.balanceKobo, raw: {} };
  }
}

describe("recordError", () => {
  it("never throws, even if the database is unreachable", async () => {
    const broken = {
      insert: () => {
        throw new Error("db down");
      },
    } as unknown as Database;
    await expect(recordError(broken, "POST /api/x", new Error("boom"))).resolves.toBeUndefined();
  });
});

describe.skipIf(!hasTestDatabase)("monitoring (real PostgreSQL)", { timeout: 60_000 }, () => {
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

  const now = new Date("2026-11-16T10:00:00Z");

  describe("recordError / listRecentErrors", () => {
    it("saves where and what, shortens long text, newest first", async () => {
      await recordError(db, "GET /a", new Error("first"));
      await recordError(db, "POST /b", "x".repeat(2_000));
      const errors = await listRecentErrors(db);
      expect(errors).toHaveLength(2);
      expect(errors[0]).toMatchObject({ context: "POST /b" });
      expect(errors[0]!.message.length).toBeLessThanOrEqual(500);
      expect(errors[1]).toMatchObject({ context: "GET /a", message: "first" });
      expect(errors[1]!.detail).toContain("Error: first");
    });
  });

  describe("runJobs", () => {
    it("runs every job, records each, and one failure doesn't stop the others", async () => {
      const results = await runJobs({
        db,
        getProvider: () => new RichProvider(),
        getFundingGateway: () => {
          throw new Error("Missing Monnify settings");
        },
        now: () => now,
      });
      expect(results.map((r) => [r.job, r.ok])).toEqual([
        ["orders.recheck", true],
        ["funding.reconcile", false],
        ["cleanup", true],
      ]);
      expect(results[1]!.error).toBe("Missing Monnify settings");

      const runs = await db.select().from(schema.jobRuns);
      expect(runs).toHaveLength(3);
      expect(runs.find((r) => r.job === "orders.recheck")).toMatchObject({
        ok: true,
        summary: expect.objectContaining({ checked: 0 }),
      });
      expect(runs.find((r) => r.job === "funding.reconcile")).toMatchObject({
        ok: false,
        error: "Missing Monnify settings",
      });
    });

    it("marks a job failed when it finished but hit errors (e.g. Monnify refused sign-in)", async () => {
      const gateway = new FakeGateway();
      gateway.listError = new Error("Monnify sign-in failed (HTTP 401)");
      const [user] = await db.insert(schema.users).values({ fullName: "Ada" }).returning();
      await db.insert(schema.wallets).values({ userId: user!.id });
      await db.insert(schema.fundingAccounts).values({
        userId: user!.id,
        gateway: "monnify",
        accountReference: user!.id,
        bankCode: "035",
        bankName: "Wema",
        accountNumber: "5000000001",
        accountName: "Ada",
      });
      const [result] = await runJobs({
        db,
        getProvider: () => new RichProvider(),
        getFundingGateway: () => gateway,
        only: ["funding.reconcile"],
        now: () => now,
      });
      expect(result).toMatchObject({ job: "funding.reconcile", ok: false });
      expect(result!.error).toMatch(/1 error/);
      expect(result!.summary).toMatchObject({ errors: 1 });
    });

    it("can run just one job", async () => {
      const results = await runJobs({
        db,
        getProvider: () => new RichProvider(),
        getFundingGateway: () => new FakeGateway(),
        only: ["cleanup"],
        now: () => now,
      });
      expect(results.map((r) => r.job)).toEqual(["cleanup"]);
    });

    it("clean-up removes only old rows", async () => {
      const [user] = await db.insert(schema.users).values({ fullName: "Ada" }).returning();
      await db.insert(schema.sessions).values([
        { userId: user!.id, tokenHash: "expired", expiresAt: new Date("2026-11-01") },
        { userId: user!.id, tokenHash: "live", expiresAt: new Date("2026-12-01") },
      ]);
      await db.insert(schema.errorLog).values([
        { context: "old", message: "m", createdAt: new Date("2026-10-01") },
        { context: "new", message: "m", createdAt: new Date("2026-11-15") },
      ]);
      await db.insert(schema.rateLimits).values([
        { key: "old", windowStart: new Date("2026-11-10"), count: 1 },
        { key: "new", windowStart: new Date("2026-11-16T09:59:00Z"), count: 1 },
      ]);
      const [result] = await runJobs({
        db,
        getProvider: () => new RichProvider(),
        getFundingGateway: () => new FakeGateway(),
        only: ["cleanup"],
        now: () => now,
      });
      expect(result).toMatchObject({
        ok: true,
        summary: { expiredSessions: 1, oldErrors: 1, oldRateLimits: 1 },
      });
      const sessions = await db.select().from(schema.sessions);
      expect(sessions.map((s) => s.tokenHash)).toEqual(["live"]);
      expect((await db.select().from(schema.errorLog)).map((e) => e.context)).toEqual(["new"]);
    });
  });

  describe("getSystemStatus", () => {
    it("flags jobs that never ran or stopped running", async () => {
      const status = await getSystemStatus(db, { getProvider: () => new RichProvider(), now });
      expect(status.jobs.map((j) => [j.job, j.stale])).toEqual(JOBS.map((j) => [j.name, true]));

      // A fresh successful recheck is fine; one older than 3× its interval is stale.
      await db.insert(schema.jobRuns).values([
        { job: "orders.recheck", startedAt: now, finishedAt: now, ok: true },
        {
          job: "funding.reconcile",
          startedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
          finishedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
          ok: true,
        },
        { job: "cleanup", startedAt: now, finishedAt: now, ok: false, error: "disk full" },
      ]);
      const after = await getSystemStatus(db, { getProvider: () => new RichProvider(), now });
      const byName = Object.fromEntries(after.jobs.map((j) => [j.job, j]));
      expect(byName["orders.recheck"]).toMatchObject({ stale: false, lastOk: true });
      expect(byName["funding.reconcile"]).toMatchObject({ stale: true, lastOk: true });
      expect(byName["cleanup"]).toMatchObject({
        stale: true,
        lastOk: false,
        lastError: "disk full",
      });
    });

    it("compares the VTpass balance with what customers hold", async () => {
      const [user] = await db.insert(schema.users).values({ fullName: "Ada" }).returning();
      const [wallet] = await db.insert(schema.wallets).values({ userId: user!.id }).returning();
      await credit(db, { walletId: wallet!.id, amountKobo: 5_000_000, reason: "seed" }); // ₦50,000

      const rich = new RichProvider(); // ₦100,000 at VTpass
      expect(await getSystemStatus(db, { getProvider: () => rich, now })).toMatchObject({
        provider: { balanceKobo: 10_000_000, error: null },
        walletsTotalKobo: 5_000_000,
        providerCoversWallets: true,
        ledgerMatches: true,
      });

      rich.balanceKobo = 1_000_000; // ₦10,000: less than customers could spend
      expect(await getSystemStatus(db, { getProvider: () => rich, now })).toMatchObject({
        providerCoversWallets: false,
      });

      rich.balanceError = new Error("VTpass unreachable");
      expect(await getSystemStatus(db, { getProvider: () => rich, now })).toMatchObject({
        provider: { balanceKobo: null, error: "VTpass unreachable" },
        providerCoversWallets: null,
      });
    });

    it("counts errors in the last 24 hours", async () => {
      await db.insert(schema.errorLog).values([
        { context: "a", message: "m", createdAt: new Date(now.getTime() - 60_000) },
        {
          context: "b",
          message: "m",
          createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        },
      ]);
      const status = await getSystemStatus(db, { getProvider: () => new RichProvider(), now });
      expect(status.errorsLast24h).toBe(1);
      expect(status.recentErrors).toHaveLength(2);
    });
  });
});

describe("jobsDueAt (the 5-minute schedule)", () => {
  const at = (iso: string) => jobsDueAt(new Date(iso));
  it("re-checks orders every time", () => {
    expect(at("2026-11-16T10:05:00Z")).toEqual(["orders.recheck"]);
  });
  it("checks Monnify on the quarter hour", () => {
    expect(at("2026-11-16T10:15:00Z")).toEqual(["orders.recheck", "funding.reconcile"]);
    expect(at("2026-11-16T10:45:00Z")).toEqual(["orders.recheck", "funding.reconcile"]);
  });
  it("cleans up once a day at 03:00 Lagos time (02:00 UTC)", () => {
    expect(at("2026-11-16T02:00:00Z")).toEqual(["orders.recheck", "funding.reconcile", "cleanup"]);
    expect(at("2026-11-16T03:00:00Z")).not.toContain("cleanup");
  });
  it("tolerates a schedule that fires a few seconds late", () => {
    expect(at("2026-11-16T10:15:07Z")).toContain("funding.reconcile");
  });
});
