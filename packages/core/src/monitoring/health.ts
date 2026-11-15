// A tiny "is the database answering?" check for /api/health.
import type { DbOrTx } from "@repo/db";
import { sql } from "drizzle-orm";

export async function pingDatabase(db: DbOrTx): Promise<void> {
  await db.execute(sql`select 1`);
}
