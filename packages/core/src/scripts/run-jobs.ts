// pnpm jobs:run [orders.recheck|funding.reconcile|cleanup ...]
// Runs the background jobs once (all of them, or the ones named) against DATABASE_URL and prints
// what each did. Each run is recorded and shows on the admin System page. Once hosted, a
// Cloudflare schedule runs the same jobs every few minutes.
import { createDb, loadLocalEnv } from "@repo/db";

import { createMonnifyGatewayFromEnv } from "../funding/monnify/gateway.ts";
import { JOBS, type JobName, runJobs } from "../monitoring/jobs.ts";
import { createProviderRegistry } from "../providers/registry.ts";

loadLocalEnv();

const names = JOBS.map((j) => j.name);
const only = process.argv.slice(2) as JobName[];
const unknown = only.filter((n) => !names.includes(n));
if (unknown.length > 0) {
  console.error(`Unknown job(s): ${unknown.join(", ")}. Jobs: ${names.join(", ")}`);
  process.exit(1);
}

const { db, close } = createDb();
try {
  const results = await runJobs({
    db,
    getProvider: createProviderRegistry(),
    getFundingGateway: createMonnifyGatewayFromEnv,
    only: only.length > 0 ? only : undefined,
  });
  for (const r of results) {
    const label = JOBS.find((j) => j.name === r.job)?.label ?? r.job;
    console.log(
      r.ok
        ? `✓ ${label} (${r.ms} ms): ${JSON.stringify(r.summary)}`
        : `✗ ${label} (${r.ms} ms): ${r.error}`,
    );
  }
  if (results.some((r) => !r.ok)) process.exitCode = 1;
} finally {
  await close();
}
