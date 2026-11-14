// Test database helpers. Database tests need a real PostgreSQL (row locks can't be faked), and
// they wipe tables, so they use TEST_DATABASE_URL, never DATABASE_URL.
// - Cloud sessions: a throwaway local PostgreSQL in the container.
// - Laptop: a separate Neon branch (e.g. "test"), never the dev branch.
import { createDb, type Database } from "@repo/db";
import { sql } from "drizzle-orm";

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

/** Empties every table (fast, and resets nothing else). Call in beforeEach. */
export async function resetDatabase(db: Database): Promise<void> {
  await db.execute(sql`
    truncate table audit_log, ledger_entries, funding_events, orders, prices, products,
      providers, wallets, users restart identity cascade
  `);
}
