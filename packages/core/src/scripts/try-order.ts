// pnpm orders:try — one real purchase on the VTpass SANDBOX for the seed user, then prints the
// order row and the wallet's ledger entries. Run on the laptop after `pnpm db:seed`.
//   pnpm orders:try                → cheapest MTN data plan to 08011111111 (sandbox success number)
//   pnpm orders:try airtime 100    → ₦100 MTN airtime to 08011111111
import { createDb, loadLocalEnv, schema } from "@repo/db";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";

import { formatNaira } from "../money.ts";
import { purchaseErrorResponse } from "../orders/http.ts";
import { createPurchaseService } from "../orders/purchase.ts";
import { createProviderRegistry } from "../providers/registry.ts";
import { getBalance } from "../wallet/wallet.ts";

loadLocalEnv();

const SEED_EMAIL = "seed-user@example.test";
const RECIPIENT = "08011111111";
const [kind = "data", nairaArg] = process.argv.slice(2);

if (!process.env.VTPASS_BASE_URL?.includes("sandbox.vtpass.com")) {
  console.error("Refusing to run: VTPASS_BASE_URL must point at the VTpass sandbox.");
  process.exit(1);
}

const { db, close } = createDb();
try {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, SEED_EMAIL));
  if (!user) throw new Error("Seed user not found: run `pnpm db:seed` first.");
  const [wallet] = await db.select().from(schema.wallets).where(eq(schema.wallets.userId, user.id));

  const productQuery =
    kind === "airtime"
      ? and(eq(schema.products.category, "airtime"), eq(schema.products.network, "mtn"))
      : and(
          eq(schema.products.category, "data"),
          eq(schema.products.network, "mtn"),
          isNotNull(schema.products.providerPriceKobo),
        );
  const [product] = await db
    .select()
    .from(schema.products)
    .where(and(productQuery, eq(schema.products.isActive, true)))
    .orderBy(asc(schema.products.providerPriceKobo))
    .limit(1);
  if (!product) throw new Error(`No active MTN ${kind} product: run \`pnpm db:seed\` first.`);

  const faceValueKobo = kind === "airtime" ? Number(nairaArg ?? "100") * 100 : undefined;
  const before = await getBalance(db, wallet!.id);
  console.log(`Buying "${product.name}" for ${RECIPIENT}. Wallet before: ${formatNaira(before)}\n`);

  const purchases = createPurchaseService({ db, getProvider: createProviderRegistry() });
  const { order } = await purchases.buy({
    userId: user.id,
    productId: product.id,
    recipientPhone: RECIPIENT,
    faceValueKobo,
  });

  console.log("Order row:");
  console.table([
    {
      id: order.id,
      request_id: order.requestId,
      status: order.status,
      amount: formatNaira(order.amountKobo),
      face_value: formatNaira(order.faceValueKobo),
      provider_code: order.providerCode,
      provider_message: order.providerMessage,
      provider_reference: order.providerReference,
      attempts: order.attempts,
      refunded_at: order.refundedAt?.toISOString() ?? null,
    },
  ]);

  const entries = await db
    .select()
    .from(schema.ledgerEntries)
    .where(eq(schema.ledgerEntries.walletId, wallet!.id))
    .orderBy(desc(schema.ledgerEntries.createdAt))
    .limit(5);
  console.log("Latest ledger entries (newest first):");
  console.table(
    entries.map((e) => ({
      direction: e.direction,
      amount: formatNaira(e.amountKobo),
      balance_after: formatNaira(e.balanceAfterKobo),
      reason: e.reason,
      reference: e.referenceId,
      description: e.description,
    })),
  );
  console.log(`Wallet after: ${formatNaira(await getBalance(db, wallet!.id))}`);
} catch (error) {
  const known = purchaseErrorResponse(error);
  console.error(known ? `Refused: ${known.body.error.message}` : error);
  process.exitCode = 1;
} finally {
  await close();
}
