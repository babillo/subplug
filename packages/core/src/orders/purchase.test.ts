// Purchase flow tests: real PostgreSQL (TEST_DATABASE_URL) + a fake provider standing in for VTpass.
import { type Database, schema } from "@repo/db";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FakeProvider } from "../test/fake-provider.ts";
import { hasTestDatabase, openTestDb, resetDatabase } from "../test/db.ts";
import { credit, getBalance, getLedgerBalance, InsufficientFundsError } from "../wallet/wallet.ts";
import { PurchaseError, RecentPurchaseError } from "./errors.ts";
import { createPurchaseService, placeOrder, settleOrder } from "./purchase.ts";
import { recheckPendingOrders } from "./recheck.ts";

const START = 500_000; // ₦5,000

describe.skipIf(!hasTestDatabase)("purchase flow (real PostgreSQL)", { timeout: 120_000 }, () => {
  let db: Database;
  let close: () => Promise<void>;
  let provider: FakeProvider;
  let fx: Awaited<ReturnType<typeof setup>>;
  let phoneCounter = 0;

  beforeAll(() => {
    ({ db, close } = openTestDb());
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await resetDatabase(db);
    provider = new FakeProvider();
    fx = await setup();
  });

  /** A fresh recipient per call, so the 15-second same-number rule doesn't get in the way. */
  const phone = () => `0803${String(1_000_000 + phoneCounter++).slice(-7)}`;

  const service = () => createPurchaseService({ db, getProvider: () => provider });

  async function newUser(tier: "regular" | "reseller" = "regular", startKobo = START) {
    const [user] = await db
      .insert(schema.users)
      .values({ fullName: "Buyer", email: `${crypto.randomUUID()}@example.test`, tier })
      .returning();
    const [wallet] = await db.insert(schema.wallets).values({ userId: user!.id }).returning();
    if (startKobo > 0) {
      await credit(db, { walletId: wallet!.id, amountKobo: startKobo, reason: "seed" });
    }
    return { userId: user!.id, walletId: wallet!.id };
  }

  async function setup() {
    await db.insert(schema.providers).values({ id: "vtpass", name: "VTpass" });
    const [data] = await db
      .insert(schema.products)
      .values({
        category: "data",
        network: "mtn",
        name: "MTN 1GB",
        providerId: "vtpass",
        providerServiceId: "mtn-data",
        providerVariationCode: "mtn-1gb-1000",
        providerPriceKobo: 100_000,
      })
      .returning();
    const [airtime] = await db
      .insert(schema.products)
      .values({
        category: "airtime",
        network: "mtn",
        name: "MTN Airtime",
        providerId: "vtpass",
        providerServiceId: "mtn",
      })
      .returning();
    await db.insert(schema.prices).values([
      { productId: data!.id, tier: "regular", priceKobo: 100_000 },
      { productId: data!.id, tier: "reseller", priceKobo: 99_000 },
      { productId: airtime!.id, tier: "regular", discountBps: 100 },
    ]);
    const buyer = await newUser();
    return { dataId: data!.id, airtimeId: airtime!.id, ...buyer };
  }

  async function orderRow(orderId: string) {
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    return order!;
  }

  async function ledger(walletId: string) {
    return db
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.walletId, walletId))
      .orderBy(asc(schema.ledgerEntries.createdAt));
  }

  async function expectBalance(walletId: string, kobo: number) {
    expect(await getBalance(db, walletId)).toBe(kobo);
    expect(await getLedgerBalance(db, walletId)).toBe(kobo);
  }

  /** Makes an order look older, as if it was placed `seconds` ago. */
  async function age(orderId: string, seconds: number) {
    await db.execute(
      sql`update orders set created_at = now() - make_interval(secs => ${seconds}) where id = ${orderId}`,
    );
  }

  const buyData = (extra: Partial<{ clientReference: string; recipientPhone: string }> = {}) =>
    service().buy({ userId: fx.userId, productId: fx.dataId, recipientPhone: phone(), ...extra });

  describe("success", () => {
    it("debits the wallet, calls the provider once and marks the order successful", async () => {
      const { order, duplicate } = await buyData({ recipientPhone: "08011111111" });

      expect(duplicate).toBe(false);
      expect(order).toMatchObject({
        status: "success",
        amountKobo: 100_000,
        faceValueKobo: 100_000,
        recipientPhone: "08011111111",
        providerId: "vtpass",
        providerCode: "000",
        refundedAt: null,
      });
      expect(order.providerReference).toBe(`fake-${order.requestId}`);
      expect(provider.purchases).toEqual([
        {
          requestId: order.requestId,
          serviceId: "mtn-data",
          recipientPhone: "08011111111",
          amountKobo: 100_000,
          variationCode: "mtn-1gb-1000",
        },
      ]);
      await expectBalance(fx.walletId, 400_000);
      const entries = await ledger(fx.walletId);
      expect(entries.at(-1)).toMatchObject({
        direction: "debit",
        amountKobo: 100_000,
        reason: "purchase",
        referenceId: order.id,
      });
    });

    it("prices airtime with the tier discount and sends the full amount to the provider", async () => {
      const { order } = await service().buy({
        userId: fx.userId,
        productId: fx.airtimeId,
        recipientPhone: phone(),
        faceValueKobo: 100_000,
      });
      expect(order).toMatchObject({
        status: "success",
        amountKobo: 99_000,
        faceValueKobo: 100_000,
      });
      expect(provider.purchases[0]).toMatchObject({ serviceId: "mtn", amountKobo: 100_000 });
      expect(provider.purchases[0]?.variationCode).toBeUndefined();
      await expectBalance(fx.walletId, START - 99_000);
    });

    it("uses the reseller price for resellers, and the regular price when a tier has none", async () => {
      const reseller = await newUser("reseller");
      const data = await service().buy({
        userId: reseller.userId,
        productId: fx.dataId,
        recipientPhone: phone(),
      });
      expect(data.order.amountKobo).toBe(99_000);

      // No reseller row for airtime: falls back to the regular 1% discount.
      const air = await service().buy({
        userId: reseller.userId,
        productId: fx.airtimeId,
        recipientPhone: phone(),
        faceValueKobo: 100_000,
      });
      expect(air.order.amountKobo).toBe(99_000);
    });
  });

  describe("failure + refund", () => {
    it("refunds the wallet when the provider says failed", async () => {
      provider.purchaseOutcome = { status: "failed", code: "016", message: "TRANSACTION FAILED" };
      const { order } = await buyData();

      expect(order.status).toBe("failed");
      expect(order.refundedAt).not.toBeNull();
      expect(order.providerMessage).toBe("TRANSACTION FAILED");
      await expectBalance(fx.walletId, START);
      const [, debitEntry, refundEntry] = await ledger(fx.walletId);
      expect(debitEntry).toMatchObject({ reason: "purchase", referenceId: order.id });
      expect(refundEntry).toMatchObject({
        direction: "credit",
        reason: "refund",
        amountKobo: 100_000,
        referenceId: order.id,
      });
    });

    it("refunds when the adapter refuses the order before sending it", async () => {
      provider.purchaseOutcome = new RangeError("not a whole naira amount");
      const { order } = await buyData();
      expect(order.status).toBe("failed");
      await expectBalance(fx.walletId, START);
    });
  });

  describe("pending, then the re-check job", () => {
    it("pending → success: keeps the charge and marks the order successful", async () => {
      provider.purchaseOutcome = "pending";
      const { order } = await buyData();
      expect(order.status).toBe("pending");
      await expectBalance(fx.walletId, 400_000);

      await age(order.id, 180);
      provider.requeryOutcomes.set(order.requestId, "success");
      const summary = await recheckPendingOrders({ db, getProvider: () => provider });

      expect(summary).toMatchObject({ checked: 1, succeeded: 1, failed: 0, stillPending: 0 });
      expect(provider.requeries).toEqual([order.requestId]);
      const after = await orderRow(order.id);
      expect(after).toMatchObject({ status: "success", refundedAt: null, attempts: 2 });
      await expectBalance(fx.walletId, 400_000);
    });

    it("pending → failed: refunds once", async () => {
      provider.purchaseOutcome = "pending";
      const { order } = await buyData();
      await age(order.id, 180);
      provider.requeryOutcomes.set(order.requestId, "failed");

      const summary = await recheckPendingOrders({ db, getProvider: () => provider });
      expect(summary).toMatchObject({ checked: 1, failed: 1 });
      expect((await orderRow(order.id)).status).toBe("failed");
      await expectBalance(fx.walletId, START);

      // Running the job again finds nothing to do and refunds nothing more.
      const again = await recheckPendingOrders({ db, getProvider: () => provider });
      expect(again.checked).toBe(0);
      await expectBalance(fx.walletId, START);
    });

    it("pending → still pending: leaves the money taken and counts the attempt", async () => {
      provider.purchaseOutcome = "pending";
      const { order } = await buyData();
      await age(order.id, 180);
      provider.requeryOutcomes.set(order.requestId, "pending");

      const summary = await recheckPendingOrders({ db, getProvider: () => provider });
      expect(summary).toMatchObject({ checked: 1, stillPending: 1 });
      const after = await orderRow(order.id);
      expect(after).toMatchObject({ status: "pending", attempts: 2 });
      expect(after.lastCheckedAt).not.toBeNull();
      await expectBalance(fx.walletId, 400_000);
    });

    it("only checks orders older than 2 minutes", async () => {
      provider.purchaseOutcome = "pending";
      const young = (await buyData()).order;
      const old = (await buyData()).order;
      await age(young.id, 60);
      await age(old.id, 180);

      const summary = await recheckPendingOrders({ db, getProvider: () => provider });
      expect(summary.checked).toBe(1);
      expect(provider.requeries).toEqual([old.requestId]);
    });

    it("keeps going when one requery throws, and leaves that order pending", async () => {
      provider.purchaseOutcome = "pending";
      const a = (await buyData()).order;
      const b = (await buyData()).order;
      await age(a.id, 180);
      await age(b.id, 181);
      provider.requeryOutcomes.set(a.requestId, new Error("boom"));
      provider.requeryOutcomes.set(b.requestId, "success");

      const summary = await recheckPendingOrders({ db, getProvider: () => provider });
      expect(summary).toMatchObject({ checked: 2, succeeded: 1, errors: 1 });
      expect((await orderRow(a.id)).status).toBe("pending");
      expect((await orderRow(b.id)).status).toBe("success");
    });

    it("lists orders pending for over 24 hours for a human, without refunding them", async () => {
      provider.purchaseOutcome = "pending";
      const { order } = await buyData();
      await age(order.id, 25 * 3600);
      provider.requeryOutcomes.set(order.requestId, { status: "pending", code: "044" });

      const summary = await recheckPendingOrders({ db, getProvider: () => provider });
      expect(summary.stale).toEqual([
        expect.objectContaining({ orderId: order.id, requestId: order.requestId }),
      ]);
      expect((await orderRow(order.id)).status).toBe("pending");
      await expectBalance(fx.walletId, 400_000);
    });

    it("recovers from a crash between charging and calling the provider", async () => {
      // Step 1 only: money taken, order pending, provider never called.
      const order = await placeOrder(db, {
        userId: fx.userId,
        productId: fx.dataId,
        recipientPhone: phone(),
      });
      expect(provider.purchases).toHaveLength(0);
      await expectBalance(fx.walletId, 400_000);

      // The provider never heard of it: requery says 015 → failed → refund.
      await age(order.id, 180);
      await recheckPendingOrders({ db, getProvider: () => provider });
      expect((await orderRow(order.id)).status).toBe("failed");
      await expectBalance(fx.walletId, START);
    });

    it("refunds once when the purchase and the re-check job settle the same order at once", async () => {
      const order = await placeOrder(db, {
        userId: fx.userId,
        productId: fx.dataId,
        recipientPhone: phone(),
      });
      const failed = {
        status: "failed" as const,
        requestId: order.requestId,
        providerCode: "016",
        message: "TRANSACTION FAILED",
        providerReference: null,
        providerAmountKobo: null,
        raw: {},
      };
      const results = await Promise.all([
        settleOrder(db, order.id, failed),
        settleOrder(db, order.id, failed),
        settleOrder(db, order.id, failed),
      ]);
      expect(results.filter((r) => r.changed)).toHaveLength(1);
      await expectBalance(fx.walletId, START);
    });

    it("never changes an order that is already settled", async () => {
      const { order } = await buyData(); // success
      const result = await settleOrder(db, order.id, {
        status: "failed",
        requestId: order.requestId,
        providerCode: "016",
        message: "late failure",
        providerReference: null,
        providerAmountKobo: null,
        raw: {},
      });
      expect(result.changed).toBe(false);
      expect((await orderRow(order.id)).status).toBe("success");
      await expectBalance(fx.walletId, 400_000);
    });
  });

  describe("insufficient balance", () => {
    it("refuses before charging: no order, no provider call, balance unchanged", async () => {
      const poor = await newUser("regular", 50_000);
      const error = await service()
        .buy({ userId: poor.userId, productId: fx.dataId, recipientPhone: phone() })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InsufficientFundsError);
      expect(provider.purchases).toHaveLength(0);
      expect(await db.select().from(schema.orders)).toHaveLength(0);
      await expectBalance(poor.walletId, 50_000);
    });

    it("two buys racing for one balance: exactly one is charged", async () => {
      const buyer = await newUser("regular", 150_000); // enough for one ₦1,000 plan
      const results = await Promise.allSettled([
        service().buy({ userId: buyer.userId, productId: fx.dataId, recipientPhone: phone() }),
        service().buy({ userId: buyer.userId, productId: fx.dataId, recipientPhone: phone() }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(
        refused.reason,
        String((refused.reason as Error).cause ?? refused.reason),
      ).toBeInstanceOf(InsufficientFundsError);
      expect(provider.purchases).toHaveLength(1);
      await expectBalance(buyer.walletId, 50_000);
    });
  });

  describe("duplicate request", () => {
    it("the same clientReference returns the original order and charges once", async () => {
      const recipientPhone = phone();
      const first = await buyData({ clientReference: "tap-1", recipientPhone });
      const again = await buyData({ clientReference: "tap-1", recipientPhone });

      expect(again.duplicate).toBe(true);
      expect(again.order.id).toBe(first.order.id);
      expect(provider.purchases).toHaveLength(1);
      await expectBalance(fx.walletId, 400_000);
    });

    it("five identical taps at the same moment create one order and one charge", async () => {
      const recipientPhone = phone();
      const results = await Promise.all(
        Array.from({ length: 5 }, () => buyData({ clientReference: "tap-2", recipientPhone })),
      );
      expect(new Set(results.map((r) => r.order.id)).size).toBe(1);
      expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
      expect(provider.purchases).toHaveLength(1);
      await expectBalance(fx.walletId, 400_000);
    });

    it("the same clientReference from a different user is a different order", async () => {
      const other = await newUser();
      await buyData({ clientReference: "tap-3" });
      const theirs = await service().buy({
        userId: other.userId,
        productId: fx.dataId,
        recipientPhone: phone(),
        clientReference: "tap-3",
      });
      expect(theirs.duplicate).toBe(false);
      expect(provider.purchases).toHaveLength(2);
    });
  });

  describe("VTpass's 15-second same-number rule", () => {
    it("refuses a second purchase to the same number within 15 seconds, before charging", async () => {
      const recipientPhone = phone();
      await buyData({ recipientPhone });
      const error = await buyData({ recipientPhone }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RecentPurchaseError);
      expect((error as RecentPurchaseError).retryAfterSeconds).toBeGreaterThan(0);
      expect((error as RecentPurchaseError).retryAfterSeconds).toBeLessThanOrEqual(16);
      expect(provider.purchases).toHaveLength(1);
      await expectBalance(fx.walletId, 400_000);
    });

    it("allows the same number again once 16 seconds have passed", async () => {
      const recipientPhone = phone();
      const { order } = await buyData({ recipientPhone });
      await age(order.id, 17);
      await expect(buyData({ recipientPhone })).resolves.toMatchObject({ duplicate: false });
    });
  });

  describe("refusals", () => {
    it.each([
      ["an unknown product", async () => ({ productId: crypto.randomUUID() }), "product_not_found"],
      [
        "an inactive product",
        async () => {
          await db
            .update(schema.products)
            .set({ isActive: false })
            .where(eq(schema.products.id, fx.dataId));
          return {};
        },
        "product_unavailable",
      ],
      [
        "a suspended user",
        async () => {
          await db
            .update(schema.users)
            .set({ status: "suspended" })
            .where(eq(schema.users.id, fx.userId));
          return {};
        },
        "user_suspended",
      ],
      ["an unknown user", async () => ({ userId: crypto.randomUUID() }), "user_not_found"],
    ])("refuses %s without charging", async (_label, arrange, code) => {
      const overrides = await arrange();
      const error = await service()
        .buy({ userId: fx.userId, productId: fx.dataId, recipientPhone: phone(), ...overrides })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PurchaseError);
      expect((error as PurchaseError).code).toBe(code);
      expect(provider.purchases).toHaveLength(0);
      await expectBalance(fx.walletId, START);
    });

    it("refuses an invalid phone number", async () => {
      await expect(buyData({ recipientPhone: "123" })).rejects.toMatchObject({
        code: "invalid_phone",
      });
    });
  });
});
