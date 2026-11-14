import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { getDatabaseUrl } from "./env.ts";
import * as schema from "./schema/index.ts";

export type Database = ReturnType<typeof createDb>["db"];

/** A database handle inside a transaction. Wallet functions accept either. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Anything we can run queries on: the pool-backed database or an open transaction. */
export type DbOrTx = Database | Transaction;

/**
 * Opens a connection pool to Postgres (Neon). Call `close()` when a script is done,
 * otherwise Node keeps running while the pool is open.
 */
export function createDb(
  url: string = getDatabaseUrl(),
  options: { maxConnections?: number } = {},
) {
  const pool = new pg.Pool({ connectionString: url, max: options.maxConnections ?? 5 });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  return { db, pool, close: () => pool.end() };
}
