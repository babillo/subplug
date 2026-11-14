// pnpm orders:recheck — settles orders still pending after 2 minutes (success, or failed → refund).
// Run it by hand for now; it will be scheduled on Cloudflare later. Safe to run any time.
import { createDb, loadLocalEnv } from "@repo/db";

import { recheckPendingOrders } from "../orders/recheck.ts";
import { createProviderRegistry } from "../providers/registry.ts";

loadLocalEnv();

const { db, close } = createDb();
try {
  const summary = await recheckPendingOrders({ db, getProvider: createProviderRegistry() });
  console.log(
    `Checked ${summary.checked} pending order(s): ${summary.succeeded} succeeded, ` +
      `${summary.failed} failed and refunded, ${summary.stillPending} still pending, ` +
      `${summary.errors} error(s).`,
  );
  if (summary.stale.length > 0) {
    console.log("\nPending for over 24 hours: check these with the provider by hand:");
    console.table(summary.stale);
  }
  if (summary.errors > 0) process.exitCode = 1;
} finally {
  await close();
}
