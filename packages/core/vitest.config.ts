import { loadLocalEnv } from "@repo/db/env";
import { defineConfig } from "vitest/config";

// Laptop: read secrets (e.g. VTpass sandbox keys, TEST_DATABASE_URL) from the repo-root .env.local.
// Cloud: they are already in process.env from the environment's settings.
loadLocalEnv();

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globalSetup: ["src/test/global-setup.ts"],
    // Database test files share one database and wipe it between tests, so run files one at a time.
    fileParallelism: false,
  },
});
