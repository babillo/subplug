// pnpm db:check — confirms DATABASE_URL works. Prints the server and database name, never the URL.
import { sql } from "drizzle-orm";

import { createDb } from "../client.ts";

const { db, close } = createDb();
try {
  const result = await db.execute<{ database: string; version: string }>(
    sql`select current_database() as database, version() as version`,
  );
  const row = result.rows[0];
  console.log(`Connected to database "${row?.database}"`);
  console.log(row?.version);
} finally {
  await close();
}
