import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { NextConfig } from "next";

// Next.js only reads .env files inside apps/web. Our single .env.local lives at the repo root
// (laptop only; in the cloud the variables come from the environment's settings).
const rootEnvFile = resolve(process.cwd(), "../../.env.local");
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

const nextConfig: NextConfig = {
  // Our workspace packages ship TypeScript source; Next compiles them for us.
  transpilePackages: ["@repo/core", "@repo/db", "@repo/shared"],
  // Hide the floating Next.js badge in development (it covers the phone tab bar).
  devIndicators: false,
  // Cache Components is off on purpose: almost every screen is personal and live (balances,
  // orders), so plain per-request rendering is simpler. Revisit during hardening (step 8).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
