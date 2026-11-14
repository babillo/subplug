// pnpm db:migrate — applies every migration in packages/db/migrations to DATABASE_URL.
// Safe to run repeatedly: Drizzle records applied migrations and skips them next time.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDb } from "../client.ts";

const migrationsFolder = fileURLToPath(new URL("../../migrations", import.meta.url));

if (!existsSync(`${migrationsFolder}/meta/_journal.json`)) {
  console.log("No migrations yet. Add tables in src/schema, then run `pnpm db:generate`.");
  process.exit(0);
}

const { db, close } = createDb();
try {
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied.");
} finally {
  await close();
}
