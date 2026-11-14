import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import type { Database } from "./client.ts";

export const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/**
 * Applies every migration in packages/db/migrations that hasn't run yet.
 * Safe to call repeatedly: Drizzle records applied migrations and skips them.
 * Returns false when there are no migrations at all.
 */
export async function runMigrations(db: Database): Promise<boolean> {
  if (!existsSync(`${migrationsFolder}/meta/_journal.json`)) return false;
  await migrate(db, { migrationsFolder });
  return true;
}
