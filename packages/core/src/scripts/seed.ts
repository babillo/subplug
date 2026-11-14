// pnpm db:seed — development test data in the database at DATABASE_URL (Neon dev branch).
// Safe to run repeatedly: it updates what exists instead of duplicating it, and the wallet's
// ₦5,000 goes in once, through a normal ledger credit (never by setting the balance).
//
// - VTpass provider row
// - A test user with a ₦5,000 wallet
// - MTN and Airtel airtime products
// - MTN and Airtel data products, with real plan codes and prices from the VTpass sandbox
//   (needs the VTPASS_* keys; skipped with a warning if they're missing)
//
// Prices are PLACEHOLDERS to test with, not business decisions. Change them from admin later.
import { createDb, loadLocalEnv, schema } from "@repo/db";
import { eq, sql } from "drizzle-orm";

import { isDataPlan } from "@repo/shared/plans";

import { hashPin } from "../auth/pin.ts";
import { formatNaira } from "../money.ts";
import { createVtpassAdapterFromEnv } from "../providers/vtpass/adapter.ts";
import { credit, getBalance } from "../wallet/wallet.ts";

loadLocalEnv();

const TEST_USER_EMAIL = "seed-user@example.test";
/** The seed user's transaction PIN. Development test data only. */
const SEED_PIN = "1357";
const STARTING_BALANCE_KOBO = 500_000; // ₦5,000
const DATA_PLANS_PER_NETWORK = 6;

/** Placeholder airtime discounts, in basis points (100 = 1%). Keep below VTpass's commission. */
const AIRTIME_DISCOUNT_BPS = { regular: 100, reseller: 250 } as const;

const NETWORKS = [
  { network: "mtn", label: "MTN", airtimeService: "mtn", dataService: "mtn-data" },
  { network: "airtel", label: "Airtel", airtimeService: "airtel", dataService: "airtel-data" },
] as const;

const { db, close } = createDb();
try {
  await db
    .insert(schema.providers)
    .values({ id: "vtpass", name: "VTpass" })
    .onConflictDoUpdate({ target: schema.providers.id, set: { name: "VTpass" } });

  // --- Test user and wallet ------------------------------------------------------------------
  await db
    .insert(schema.users)
    .values({ fullName: "Seed Test User", email: TEST_USER_EMAIL, phone: "08011111111" })
    .onConflictDoNothing();
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, TEST_USER_EMAIL));
  // Dev-only transaction PIN, so the test user can buy (`pnpm orders:try`). Set once; a PIN
  // changed later through the app is left alone.
  if (!user!.pinHash) {
    await db
      .update(schema.users)
      .set({ pinHash: await hashPin(SEED_PIN) })
      .where(eq(schema.users.id, user!.id));
  }
  await db.insert(schema.wallets).values({ userId: user!.id }).onConflictDoNothing();
  const [wallet] = await db
    .select()
    .from(schema.wallets)
    .where(eq(schema.wallets.userId, user!.id));

  const { duplicate } = await credit(db, {
    walletId: wallet!.id,
    amountKobo: STARTING_BALANCE_KOBO,
    reason: "seed",
    referenceId: `seed:${TEST_USER_EMAIL}`,
    description: "Development seed balance",
  });
  const balance = await getBalance(db, wallet!.id);
  console.log(
    `Test user ${TEST_USER_EMAIL}: wallet ${formatNaira(balance)}` +
      (duplicate ? " (seed credit already applied earlier)" : ""),
  );

  // --- Products ------------------------------------------------------------------------------
  async function upsertProduct(values: typeof schema.products.$inferInsert) {
    const [product] = await db
      .insert(schema.products)
      .values(values)
      .onConflictDoUpdate({
        target: [
          schema.products.providerId,
          schema.products.providerServiceId,
          schema.products.providerVariationCode,
        ],
        set: {
          name: values.name,
          providerPriceKobo: values.providerPriceKobo ?? null,
          isActive: true,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    return product!;
  }

  async function upsertPrice(
    productId: string,
    tier: "regular" | "reseller",
    price: { priceKobo: number } | { discountBps: number },
  ) {
    const values = {
      productId,
      tier,
      priceKobo: "priceKobo" in price ? price.priceKobo : null,
      discountBps: "discountBps" in price ? price.discountBps : null,
    };
    await db
      .insert(schema.prices)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.prices.productId, schema.prices.tier],
        set: {
          priceKobo: values.priceKobo,
          discountBps: values.discountBps,
          updatedAt: sql`now()`,
        },
      });
  }

  for (const n of NETWORKS) {
    const airtime = await upsertProduct({
      category: "airtime",
      network: n.network,
      name: `${n.label} Airtime`,
      providerId: "vtpass",
      providerServiceId: n.airtimeService,
      providerVariationCode: null,
    });
    await upsertPrice(airtime.id, "regular", { discountBps: AIRTIME_DISCOUNT_BPS.regular });
    await upsertPrice(airtime.id, "reseller", { discountBps: AIRTIME_DISCOUNT_BPS.reseller });
  }
  console.log("Airtime products: MTN, Airtel");

  let vtpass;
  try {
    vtpass = createVtpassAdapterFromEnv();
  } catch (error) {
    console.warn(
      `Skipping data plans: ${error instanceof Error ? error.message : error}\n` +
        "Data plans need the VTpass sandbox keys (run the seed on the laptop).",
    );
  }

  if (vtpass) {
    for (const n of NETWORKS) {
      const { variations } = await vtpass.getVariations(n.dataService);
      // VTpass takes whole naira, so only plans with a whole-naira price can be sold as-is.
      const plans = variations
        // Keep real data plans only (VTpass mixes voice bundles into data lists) with whole-naira prices.
        .filter(
          (v) => v.fixedPrice && v.priceKobo > 0 && v.priceKobo % 100 === 0 && isDataPlan(v.name),
        )
        .sort((a, b) => a.priceKobo - b.priceKobo)
        .slice(0, DATA_PLANS_PER_NETWORK);

      for (const plan of plans) {
        const product = await upsertProduct({
          category: "data",
          network: n.network,
          name: plan.name,
          providerId: "vtpass",
          providerServiceId: n.dataService,
          providerVariationCode: plan.code,
          providerPriceKobo: plan.priceKobo,
        });
        // Placeholder: everyone pays VTpass's price (no profit, but never a loss). Set real
        // prices in the admin panel (Products & prices).
        await upsertPrice(product.id, "regular", { priceKobo: plan.priceKobo });
        await upsertPrice(product.id, "reseller", { priceKobo: plan.priceKobo });
      }
      console.log(
        `${n.label} data: ${plans.length} plans (${plans.map((p) => p.code).join(", ")})`,
      );
    }
  }

  const [counts] = await db
    .execute<{ products: string; prices: string; users: string }>(
      sql`
    select (select count(*) from products)::text as products,
           (select count(*) from prices)::text as prices,
           (select count(*) from users)::text as users
  `,
    )
    .then((r) => r.rows);
  console.log(
    `Done: ${counts?.users} user(s), ${counts?.products} products, ${counts?.prices} prices.`,
  );
} finally {
  await close();
}
