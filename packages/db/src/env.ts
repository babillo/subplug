// Where environment variables come from:
// - Cloud: the cloud environment's settings put them straight into process.env.
// - Laptop: a git-ignored .env.local file at the repo root.
// Real environment variables always win; .env.local only fills in what is missing.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** Loads the repo-root .env.local (if there is one) into process.env. Safe to call more than once. */
export function loadLocalEnv(startDir: string = process.cwd()): void {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      const file = join(dir, ".env.local");
      if (existsSync(file)) process.loadEnvFile(file);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return; // reached the filesystem root without finding the repo
    dir = parent;
  }
}

/** Returns DATABASE_URL or throws a helpful error. Never prints the URL: it contains the password. */
export function getDatabaseUrl(): string {
  loadLocalEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. On your laptop, add it to .env.local at the repo root " +
        "(copy .env.example). In the cloud, add it to the cloud environment's settings. See README.",
    );
  }
  return url;
}
