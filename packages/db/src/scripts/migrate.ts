// pnpm db:migrate — applies every migration in packages/db/migrations to DATABASE_URL.
// Safe to run repeatedly: Drizzle records applied migrations and skips them next time.
import { createDb } from "../client.ts";
import { runMigrations } from "../migrate.ts";

const { db, close } = createDb();
try {
  const ran = await runMigrations(db);
  console.log(
    ran
      ? "Migrations applied."
      : "No migrations yet. Add tables in src/schema, then run `pnpm db:generate`.",
  );
} finally {
  await close();
}
