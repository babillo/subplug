import { defineConfig } from "drizzle-kit";

import { loadLocalEnv } from "./src/env.ts";

loadLocalEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema",
  out: "./migrations",
  casing: "snake_case",
  // Only `migrate`/`studio` connect; `generate` works without a database.
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
