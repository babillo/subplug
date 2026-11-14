import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { getDatabaseUrl } from "./env.ts";
import * as schema from "./schema/index.ts";

export type Database = ReturnType<typeof createDb>["db"];

/**
 * Opens a connection pool to Postgres (Neon). Call `close()` when a script is done,
 * otherwise Node keeps running while the pool is open.
 */
export function createDb(url: string = getDatabaseUrl()) {
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  return { db, pool, close: () => pool.end() };
}
