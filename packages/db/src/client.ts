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
  options: {
    maxConnections?: number;
    /**
     * Close each connection after this many uses. Cloudflare Workers: 1, so no connection
     * outlives the request that opened it (Hyperdrive makes new connections cheap).
     */
    maxUses?: number;
  } = {},
) {
  const pool = new pg.Pool({
    connectionString: normaliseConnectionString(url),
    max: options.maxConnections ?? 5,
    ...(options.maxUses ? { maxUses: options.maxUses } : {}),
  });
  // An idle connection dropped by the server or runtime must not crash the app; the pool simply
  // opens a new one next time.
  pool.on("error", (error) => {
    // On Cloudflare, connections are closed as each request finishes: expected, not a problem.
    if (error.message === "This socket has been closed.") return;
    console.warn("Database connection dropped:", error.message);
  });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  return { db, pool, close: () => pool.end() };
}
