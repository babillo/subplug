// Admin actions: every change is permission-checked and audited with before/after values (rule 9).
import { type Database, schema } from "@repo/db";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hasTestDatabase, openTestDb, resetDatabase } from "../test/db.ts";
import { credit, getBalance, getLedgerBalance, InsufficientFundsError } from "../wallet/wallet.ts";
import {
  AdminError,
  adminErrorResponse,
  adjustWallet,
  assertAdmin,
  getUserDetail,
  listAuditLog,
  listOrdersAdmin,
  listProductsAdmin,
  listUsers,
  setAdminRole,
  setProductActive,
  setUserStatus,
  settleOrderManually,
  updatePrice,
} from "./admin.ts";

describe("assertAdmin", () => {
  const base = { status: "active" as const };
  it("allows an active admin", () => {
    expect(() => assertAdmin({ ...base, role: "admin" })).not.toThrow();
  });
  it("refuses customers and suspended admins", () => {
    expect(() => assertAdmin({ ...base, role: "customer" })).toThrow(AdminError);
    expect(() => assertAdmin({ role: "admin", status: "suspended" })).toThrow(AdminError);
  });
});

describe.skipIf(!hasTestDatabase)("admin actions (real PostgreSQL)", { timeout: 120_000 }, () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeAll(() => {
    ({ db, close } = openTestDb());
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await resetDatabase(db);
  });

  async function newUser(values: Partial<typeof schema.users.$inferInsert> = {}) {
    const [user] = await db
      .insert(schema.users)
      .values({ fullName: "Ada Obi", email: `${crypto.randomUUID()}@example.test`, ...values })
      .returning();
    const [wallet] = await db.insert(schema.wallets).values({ userId: user!.id }).returning();
    return { userId: user!.id, walletId: wallet!.id };
  }

  const newAdmin = () => newUser({ role: "admin", fullName: "Admin" });

  async function audits() {
    return db.select().from(schema.auditLog).orderBy(asc(schema.auditLog.createdAt));
  }

  async function expectBalance(walletId: string, kobo: number) {
    expect(await getBalance(db, walletId)).toBe(kobo);
    expect(await getLedgerBalance(db, walletId)).toBe(kobo);
  }

  async function products() {
    await db.insert(schema.providers).values({ id: "vtpass", name: "VTpass" });
    const [data, airtime] = await db
      .insert(schema.products)
      .values([
        {
          category: "data",
          network: "mtn",
          name: "MTN 1GB",
          providerId: "vtpass",
          providerServiceId: "mtn-data",
          providerVariationCode: "1gb",
          providerPriceKobo: 100_000,
        },
        {
          category: "airtime",
          network: "mtn",
          name: "MTN Airtime",
          providerId: "vtpass",
          providerServiceId: "mtn",
        },
      ])
      .returning();
    await db.insert(schema.prices).values([
      { productId: data!.id, tier: "regular", priceKobo: 105_000 },
      { productId: airtime!.id, tier: "regular", discountBps: 100 },
    ]);
    return { data: data!, airtime: airtime! };
  }

  describe("manual wallet credit/debit", () => {
    it("credits through the ledger and audits it with the note", async () => {
      const admin = await newAdmin();
      const customer = await newUser();
      const result = await adjustWallet(db, {
        adminId: admin.userId,
        userId: customer.userId,
        direction: "credit",
        amountKobo: 200_000,
        note: "Refund for failed transfer, ticket #12",
        idempotencyKey: "tap-1",
      });
      expect(result.duplicate).toBe(false);
      await expectBalance(customer.walletId, 200_000);
      const [log] = await audits();
      expect(log).toMatchObject({
        actorUserId: admin.userId,
        action: "wallet.admin_credit",
        entityId: customer.walletId,
        before: { balanceKobo: 0 },
        after: expect.objectContaining({ balanceKobo: 200_000 }),
        reason: "Refund for failed transfer, ticket #12",
      });
    });

    it("a double-click (same key) credits only once", async () => {
      const admin = await newAdmin();
      const customer = await newUser();
      const input = {
        adminId: admin.userId,
        userId: customer.userId,
        direction: "credit" as const,
        amountKobo: 50_000,
        note: "Goodwill",
        idempotencyKey: "tap-2",
      };
      const results = await Promise.all([adjustWallet(db, input), adjustWallet(db, input)]);
      expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
      await expectBalance(customer.walletId, 50_000);
      expect(await audits()).toHaveLength(1);
    });

    it("debits, but never below zero", async () => {
      const admin = await newAdmin();
      const customer = await newUser();
      await credit(db, { walletId: customer.walletId, amountKobo: 10_000, reason: "seed" });
      await expect(
        adjustWallet(db, {
          adminId: admin.userId,
          userId: customer.userId,
          direction: "debit",
          amountKobo: 20_000,
          note: "Reverse duplicate credit",
          idempotencyKey: "tap-3",
        }),
      ).rejects.toBeInstanceOf(InsufficientFundsError);
      await expectBalance(customer.walletId, 10_000);
    });

    it("requires a note explaining why", async () => {
      const admin = await newAdmin();
      const customer = await newUser();
      await expect(
        adjustWallet(db, {
          adminId: admin.userId,
          userId: customer.userId,
          direction: "credit",
          amountKobo: 1_000,
          note: " ",
          idempotencyKey: "tap-4",
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    });
  });

  describe("prices", () => {
    it("changes a data price and audits before/after", async () => {
      const admin = await newAdmin();
      const { data } = await products();
      const price = await updatePrice(db, {
        adminId: admin.userId,
        productId: data.id,
        tier: "regular",
        priceKobo: 102_000,
        note: "Market adjustment",
      });
      expect(price).toMatchObject({ priceKobo: 102_000, discountBps: null });
      const [log] = await audits();
      expect(log).toMatchObject({
        action: "price.update",
        entityType: "price",
        entityId: `${data.id}:regular`,
        before: { priceKobo: 105_000, discountBps: null },
        after: { priceKobo: 102_000, discountBps: null },
        reason: "Market adjustment",
      });
    });

    it("creates a tier price that didn't exist (before is null)", async () => {
      const admin = await newAdmin();
      const { data } = await products();
      await updatePrice(db, {
        adminId: admin.userId,
        productId: data.id,
        tier: "reseller",
        priceKobo: 101_000,
      });
      const [log] = await audits();
      expect(log).toMatchObject({ before: null, after: { priceKobo: 101_000, discountBps: null } });
    });

    it("refuses a data price below what VTpass charges us, unless confirmed", async () => {
      const admin = await newAdmin();
      const { data } = await products();
      await expect(
        updatePrice(db, {
          adminId: admin.userId,
          productId: data.id,
          tier: "regular",
          priceKobo: 99_000,
        }),
      ).rejects.toMatchObject({ code: "price_below_cost" });
      expect(await audits()).toHaveLength(0);

      await updatePrice(db, {
        adminId: admin.userId,
        productId: data.id,
        tier: "regular",
        priceKobo: 99_000,
        allowBelowCost: true,
        note: "Promo",
      });
      expect((await audits())[0]?.after).toMatchObject({ priceKobo: 99_000 });
    });

    it("airtime takes a discount in basis points, data takes a fixed price", async () => {
      const admin = await newAdmin();
      const { data, airtime } = await products();
      await updatePrice(db, {
        adminId: admin.userId,
        productId: airtime.id,
        tier: "regular",
        discountBps: 250,
      });
      for (const bad of [
        { productId: airtime.id, priceKobo: 1_000 },
        { productId: airtime.id, discountBps: 10_000 },
        { productId: airtime.id, discountBps: -1 },
        { productId: data.id, discountBps: 100 },
        { productId: data.id, priceKobo: 0 },
        { productId: data.id, priceKobo: 100_000.5 },
      ]) {
        await expect(
          updatePrice(db, { adminId: admin.userId, tier: "regular", ...bad }),
        ).rejects.toMatchObject({ code: "invalid_input" });
      }
    });
  });

  describe("products and users", () => {
    it("turns a product off and on, audited", async () => {
      const admin = await newAdmin();
      const { data } = await products();
      await setProductActive(db, {
        adminId: admin.userId,
        productId: data.id,
        active: false,
        note: "VTpass outage",
      });
      const [row] = await db.select().from(schema.products).where(eq(schema.products.id, data.id));
      expect(row!.isActive).toBe(false);
      expect((await audits())[0]).toMatchObject({
        action: "product.deactivate",
        before: { isActive: true },
        after: { isActive: false },
      });
    });

    it("suspends a customer (their sessions stop working) and refuses self-suspension", async () => {
      const admin = await newAdmin();
      const customer = await newUser();
      await setUserStatus(db, {
        adminId: admin.userId,
        userId: customer.userId,
        status: "suspended",
        note: "Fraud check",
      });
      const [row] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, customer.userId));
      expect(row!.status).toBe("suspended");
      expect((await audits())[0]).toMatchObject({
        action: "user.suspend",
        before: { status: "active" },
        after: { status: "suspended" },
      });

      await expect(
        setUserStatus(db, {
          adminId: admin.userId,
          userId: admin.userId,
          status: "suspended",
          note: "oops",
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    });

    it("reports not_found for unknown products and users", async () => {
      const admin = await newAdmin();
      await expect(
        setProductActive(db, {
          adminId: admin.userId,
          productId: crypto.randomUUID(),
          active: false,
        }),
      ).rejects.toMatchObject({ code: "not_found" });
      await expect(
        setUserStatus(db, {
          adminId: admin.userId,
          userId: crypto.randomUUID(),
          status: "suspended",
          note: "Fraud check",
        }),
      ).rejects.toMatchObject({ code: "not_found" });
    });
  });

  describe("settling a stuck order by hand", () => {
    async function pendingOrder() {
      const customer = await newUser();
      const { data } = await products();
      await credit(db, { walletId: customer.walletId, amountKobo: 500_000, reason: "seed" });
      const [order] = await db
        .insert(schema.orders)
        .values({
          requestId: `202611141000${crypto.randomUUID().slice(0, 8)}`,
          userId: customer.userId,
          walletId: customer.walletId,
          productId: data.id,
          providerId: "vtpass",
          recipientPhone: "08011111111",
          faceValueKobo: 100_000,
          amountKobo: 105_000,
        })
        .returning();
      // The purchase debit that a real order would have.
      const { debit } = await import("../wallet/wallet.ts");
      await debit(db, {
        walletId: customer.walletId,
        amountKobo: 105_000,
        reason: "purchase",
        referenceId: order!.id,
      });
      return { customer, order: order! };
    }

    it("marks it failed and refunds once, audited", async () => {
      const admin = await newAdmin();
      const { customer, order } = await pendingOrder();
      await settleOrderManually(db, {
        adminId: admin.userId,
        orderId: order.id,
        outcome: "failed",
        note: "VTpass confirmed not delivered",
      });

      const [row] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
      expect(row).toMatchObject({ status: "failed", providerCode: "MANUAL" });
      expect(row!.refundedAt).not.toBeNull();
      await expectBalance(customer.walletId, 500_000);
      expect((await audits()).at(-1)).toMatchObject({
        action: "order.settle",
        entityId: order.id,
        before: { status: "pending" },
        after: { status: "failed", refunded: true },
        reason: "VTpass confirmed not delivered",
      });

      // Not pending any more: a second settle is refused and refunds nothing.
      await expect(
        settleOrderManually(db, {
          adminId: admin.userId,
          orderId: order.id,
          outcome: "failed",
          note: "again",
        }),
      ).rejects.toMatchObject({ code: "order_not_pending" });
      await expectBalance(customer.walletId, 500_000);
    });

    it("marks it successful without refunding", async () => {
      const admin = await newAdmin();
      const { customer, order } = await pendingOrder();
      await settleOrderManually(db, {
        adminId: admin.userId,
        orderId: order.id,
        outcome: "success",
        note: "Delivered per VTpass",
      });
      await expectBalance(customer.walletId, 395_000);
    });
  });

  describe("read-only views", () => {
    it("searches users by name, email or phone, with balances", async () => {
      await newUser({ fullName: "Chidi Okafor", phone: "08030000001" });
      const ada = await newUser({ fullName: "Ada Obi", email: "ada.obi@example.test" });
      await credit(db, { walletId: ada.walletId, amountKobo: 7_500, reason: "seed" });

      expect((await listUsers(db, { search: "okafor" })).users.map((u) => u.fullName)).toEqual([
        "Chidi Okafor",
      ]);
      expect((await listUsers(db, { search: "0803000" })).users).toHaveLength(1);
      const found = (await listUsers(db, { search: "ADA.OBI@" })).users;
      expect(found).toEqual([expect.objectContaining({ fullName: "Ada Obi", balanceKobo: 7_500 })]);
      expect(JSON.stringify(found)).not.toContain("pinHash");
    });

    it("shows a user's detail without secrets", async () => {
      const ada = await newUser({ pinHash: "$2a$10$secret" });
      const detail = await getUserDetail(db, ada.userId);
      expect(detail).toMatchObject({ id: ada.userId, balanceKobo: 0, hasPin: true });
      expect(JSON.stringify(detail)).not.toContain("$2a$");
      expect(await getUserDetail(db, crypto.randomUUID())).toBeNull();
    });

    it("lists orders by status and finds ones stuck pending for over 24 hours", async () => {
      const { order } = await (async () => {
        const customer = await newUser();
        const { data } = await products();
        const [o] = await db
          .insert(schema.orders)
          .values({
            requestId: "202611141000stuck",
            userId: customer.userId,
            walletId: customer.walletId,
            productId: data.id,
            providerId: "vtpass",
            recipientPhone: "08011111111",
            faceValueKobo: 100_000,
            amountKobo: 105_000,
          })
          .returning();
        return { order: o! };
      })();
      expect((await listOrdersAdmin(db, { stuckOnly: true })).orders).toHaveLength(0);
      await db.execute(
        sql`update orders set created_at = now() - interval '25 hours' where id = ${order.id}`,
      );
      const stuck = await listOrdersAdmin(db, { stuckOnly: true });
      expect(stuck.orders).toEqual([
        expect.objectContaining({ id: order.id, productName: "MTN 1GB", userName: "Ada Obi" }),
      ]);
      expect((await listOrdersAdmin(db, { status: "success" })).orders).toHaveLength(0);
    });

    it("lists all products with their provider cost and every tier price", async () => {
      const { data } = await products();
      const list = await listProductsAdmin(db);
      expect(list.find((p) => p.id === data.id)).toMatchObject({
        providerPriceKobo: 100_000,
        isActive: true,
        prices: [{ tier: "regular", priceKobo: 105_000, discountBps: null }],
      });
    });

    it("lists the audit log, newest first, filtered by entity", async () => {
      const admin = await newAdmin();
      const { data, airtime } = await products();
      await updatePrice(db, {
        adminId: admin.userId,
        productId: data.id,
        tier: "regular",
        priceKobo: 106_000,
      });
      await updatePrice(db, {
        adminId: admin.userId,
        productId: airtime.id,
        tier: "regular",
        discountBps: 200,
      });
      const all = await listAuditLog(db);
      expect(all.entries.map((e) => e.entityId)).toEqual([
        `${airtime.id}:regular`,
        `${data.id}:regular`,
      ]);
      expect(all.entries[0]).toMatchObject({ actorName: "Admin" });
      const one = await listAuditLog(db, { entityType: "price", entityId: `${data.id}:regular` });
      expect(one.entries).toHaveLength(1);
    });
  });
});

describe("adminErrorResponse", () => {
  it.each([
    ["forbidden", 403],
    ["not_found", 404],
    ["invalid_input", 400],
    ["price_below_cost", 409],
    ["order_not_pending", 409],
  ] as const)("maps %s to HTTP %s", (code, status) => {
    expect(adminErrorResponse(new AdminError(code, "m"))?.status).toBe(status);
  });
  it("returns null for other errors", () => {
    expect(adminErrorResponse(new Error("x"))).toBeNull();
  });
});

describe.skipIf(!hasTestDatabase)("setAdminRole", () => {
  it("grants admin and audits it with no actor", async () => {
    const { db, close } = openTestDb();
    try {
      await resetDatabase(db);
      const [user] = await db.insert(schema.users).values({ fullName: "Owner" }).returning();
      await setAdminRole(db, { userId: user!.id, admin: true, note: "Granted from the laptop" });
      const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user!.id));
      expect(row!.role).toBe("admin");
      const [log] = await db.select().from(schema.auditLog);
      expect(log).toMatchObject({
        actorUserId: null,
        action: "user.grant_admin",
        before: { role: "customer" },
        after: { role: "admin" },
      });
    } finally {
      await close();
    }
  });
});
