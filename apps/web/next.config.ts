import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Our workspace packages ship TypeScript source; Next compiles them for us.
  transpilePackages: ["@repo/core", "@repo/shared"],
  cacheComponents: true,
  partialPrefetching: true,
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
