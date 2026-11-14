// Test database helpers. Database tests need a real PostgreSQL (row locks can't be faked), and
// they wipe tables, so they use TEST_DATABASE_URL, never DATABASE_URL.
// - Cloud sessions: a throwaway local PostgreSQL in the container.
// - Laptop: a separate Neon branch (e.g. "test"), never the dev branch.
import { createDb, type Database } from "@repo/db";
import { sql } from "drizzle-orm";

import { pgErrorCode } from "../db-errors.ts";

export const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim() || undefined;

/** True when database tests can run. When false, they are skipped with a visible message. */
export const hasTestDatabase = testDatabaseUrl !== undefined;

if (testDatabaseUrl && testDatabaseUrl === process.env.DATABASE_URL?.trim()) {
  throw new Error(
    "TEST_DATABASE_URL is the same as DATABASE_URL. Database tests delete data, so they need " +
      "their own database. Point TEST_DATABASE_URL at a separate one.",
  );
}

/** Opens a pool big enough for the concurrency tests. Close it in afterAll. */
export function openTestDb(): { db: Database; close: () => Promise<void> } {
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is not set");
  const { db, close } = createDb(testDatabaseUrl, { maxConnections: 20 });
  return { db, close };
}

/**
 * Empties every table. Call in beforeEach.
 * Retries on a deadlock or lock timeout: if a previous test failed or timed out, its queries can
 * still be finishing in the background, and wiping tables needs every table to itself.
 */
export async function resetDatabase(db: Database): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '15s'`);
        await tx.execute(sql`
          truncate table audit_log, ledger_entries, funding_events, orders, prices, products,
            providers, wallets, users restart identity cascade
        `);
      });
      return;
    } catch (error) {
      const code = pgErrorCode(error);
      const retryable = code === "40P01" /* deadlock */ || code === "55P03"; /* lock timeout */
      if (!retryable || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
    }
  }
}
