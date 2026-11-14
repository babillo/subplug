// pnpm funding:reconcile — backup for lost webhooks: asks Monnify for each funding account's
// recent payments and credits any not yet credited (each payment at most once). Safe any time.
import { createDb, loadLocalEnv } from "@repo/db";

import { reconcileFunding } from "../funding/funding.ts";
import { createMonnifyGatewayFromEnv } from "../funding/monnify/gateway.ts";

loadLocalEnv();

const { db, close } = createDb();
try {
  const summary = await reconcileFunding(db, createMonnifyGatewayFromEnv());
  console.log(
    `Checked ${summary.accounts} account(s). Monnify listed ${summary.listed} payment(s); ` +
      `${summary.checked} new one(s) looked up, ${summary.credited} credited, ` +
      `${summary.notPaid} not paid yet, ${summary.unknownAccount} for unknown accounts, ` +
      `${summary.errors} error(s).`,
  );
  if (summary.listed === 0) {
    console.log(
      "Monnify has no payments on these accounts yet. In the sandbox, send test payments with " +
        "Monnify's payment simulator; real bank transfers don't reach sandbox accounts. See README.",
    );
  }
  if (summary.errors > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await close();
}
