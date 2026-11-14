// pnpm funding:account <BVN or NIN> — gives the seed user a Monnify (sandbox) account number to
// pay into, then prints it with the wallet balance. Running it again just shows the same accounts.
import { createDb, loadLocalEnv, schema } from "@repo/db";
import { eq } from "drizzle-orm";

import { createFundingAccounts } from "../funding/funding.ts";
import { createMonnifyGatewayFromEnv } from "../funding/monnify/gateway.ts";
import { formatNaira } from "../money.ts";
import { getBalance } from "../wallet/wallet.ts";

loadLocalEnv();

const SEED_EMAIL = "seed-user@example.test";
const idNumber = process.argv[2]?.trim() ?? "";

if (!process.env.MONNIFY_BASE_URL?.includes("sandbox.monnify.com")) {
  console.error("Refusing to run: MONNIFY_BASE_URL must point at the Monnify sandbox.");
  process.exit(1);
}

const { db, close } = createDb();
try {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, SEED_EMAIL));
  if (!user) throw new Error("Seed user not found: run `pnpm db:seed` first.");
  const [wallet] = await db.select().from(schema.wallets).where(eq(schema.wallets.userId, user.id));

  const { accounts, created } = await createFundingAccounts(db, createMonnifyGatewayFromEnv(), {
    userId: user.id,
    // The sandbox accepts any 11 digits. Sent to Monnify only; never stored or printed.
    ...(idNumber ? { bvn: idNumber } : {}),
  });
  console.log(created ? "Created funding account(s):" : "Existing funding account(s):");
  console.table(
    accounts.map((a) => ({
      bank: a.bankName,
      account_number: a.accountNumber,
      name: a.accountName,
    })),
  );
  console.log(`Wallet balance: ${formatNaira(await getBalance(db, wallet!.id))}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await close();
}
