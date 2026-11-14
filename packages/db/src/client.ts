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
 * Neon's connection strings say sslmode=require. The pg driver currently treats that as
 * verify-full (encrypted AND the server certificate checked) but warns that a future version will
 * weaken it. Spelling out verify-full keeps today's stronger behaviour and silences the warning.
 */
export function normaliseConnectionString(url: string): string {
  return url.replace(/([?&]sslmode=)(require|prefer|verify-ca)(?=&|$)/, "$1verify-full");
}

/**
 * Opens a connection pool to Postgres (Neon). Call `close()` when a script is done,
 * otherwise Node keeps running while the pool is open.
 */
export function createDb(
  url: string = getDatabaseUrl(),
  options: { maxConnections?: number } = {},
) {
  const pool = new pg.Pool({
    connectionString: normaliseConnectionString(url),
    max: options.maxConnections ?? 5,
  });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  return { db, pool, close: () => pool.end() };
}
