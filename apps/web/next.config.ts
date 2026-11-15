import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { NextConfig } from "next";

// Next.js only reads .env files inside apps/web. Our single .env.local lives at the repo root
// (laptop only; in the cloud the variables come from the environment's settings).
const rootEnvFile = resolve(process.cwd(), "../../.env.local");
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy: which sources the browser may load scripts, styles, images etc. from.
 * Everything we use is served from our own site (fonts are self-hosted by next/font).
 * - 'unsafe-inline' scripts: Next.js and our theme script are inline. Removing it needs a
 *   per-request "nonce", which forces every page to render on each request; worth revisiting.
 * - Development only: 'unsafe-eval' and websockets, which the dev server's hot reload needs.
 * - frame-ancestors 'none': no other site may show our pages inside a frame (click-jacking).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Older browsers' version of frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  // Don't let browsers guess file types (stops a file being run as a script).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send only our domain (never full URLs) when people follow links to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // We never need the camera, microphone or location.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Always use HTTPS for a year (production only: the laptop uses plain http://localhost).
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Don't advertise which framework we run.
  poweredByHeader: false,
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
