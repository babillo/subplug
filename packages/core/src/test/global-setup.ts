// Runs once before all tests: brings the test database's tables up to date.
import { createDb, loadLocalEnv } from "@repo/db";
import { runMigrations } from "@repo/db/migrate";

export default async function setup() {
  loadLocalEnv();
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (!url) {
    console.warn(
      "\n⚠ TEST_DATABASE_URL is not set: database tests (wallet ledger) will be SKIPPED.\n" +
        "  See README → Tests and checks.\n",
    );
    return;
  }
  if (url === process.env.DATABASE_URL?.trim()) return; // test/db.ts throws a clear error
  const { db, close } = createDb(url);
  try {
    await runMigrations(db);
  } finally {
    await close();
  }
}
