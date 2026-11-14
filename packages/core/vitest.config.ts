import { loadLocalEnv } from "@repo/db/env";
import { defineConfig } from "vitest/config";

// Laptop: read secrets (e.g. VTpass sandbox keys) from the repo-root .env.local.
// Cloud: they are already in process.env from the environment's settings.
loadLocalEnv();

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
