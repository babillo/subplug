// What a signed-in customer can see: products at their own price, wallet statement, orders.
import { type Database, schema } from "@repo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hasTestDatabase, openTestDb, resetDatabase } from "../test/db.ts";
import { credit, debit } from "../wallet/wallet.ts";
import {
  getUserOrder,
  getWalletStatement,
  listProductsForUser,
  listUserOrders,
} from "./account.ts";

describe.skipIf(!hasTestDatabase)(
  "customer account views (real PostgreSQL)",
  { timeout: 120_000 },
  () => {
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

    async function newUser(tier: "regular" | "reseller" = "regular") {
      const [user] = await db
        .insert(schema.users)
        .values({ fullName: "Ada", email: `${crypto.randomUUID()}@example.test`, tier })
        .returning();
      const [wallet] = await db.insert(schema.wallets).values({ userId: user!.id }).returning();
      return { userId: user!.id, walletId: wallet!.id };
    }

    async function catalog() {
      await db.insert(schema.providers).values([
        { id: "vtpass", name: "VTpass" },
        { id: "offline", name: "Switched off", isActive: false },
      ]);
      const [data1, data2, airtime, inactive, noPrice, offlineProvider] = await db
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
            category: "data",
            network: "mtn",
            name: "MTN 500MB",
            providerId: "vtpass",
            providerServiceId: "mtn-data",
            providerVariationCode: "500mb",
            providerPriceKobo: 50_000,
          },
          {
            category: "airtime",
            network: "mtn",
            name: "MTN Airtime",
            providerId: "vtpass",
            providerServiceId: "mtn",
          },
          {
            category: "data",
            network: "glo",
            name: "Glo 1GB (off)",
            providerId: "vtpass",
            providerServiceId: "glo-data",
            providerVariationCode: "g1",
            providerPriceKobo: 90_000,
            isActive: false,
          },
          {
            category: "data",
            network: "glo",
            name: "Glo no price",
            providerId: "vtpass",
            providerServiceId: "glo-data",
            providerVariationCode: "g2",
            providerPriceKobo: 90_000,
          },
          {
            category: "data",
            network: "airtel",
            name: "Airtel via offline provider",
            providerId: "offline",
            providerServiceId: "airtel-data",
            providerVariationCode: "a1",
            providerPriceKobo: 90_000,
          },
        ])
        .returning();
      await db.insert(schema.prices).values([
        { productId: data1!.id, tier: "regular", priceKobo: 100_000 },
        { productId: data1!.id, tier: "reseller", priceKobo: 98_000 },
        { productId: data2!.id, tier: "regular", priceKobo: 50_000 },
        { productId: airtime!.id, tier: "regular", discountBps: 100 },
        { productId: inactive!.id, tier: "regular", priceKobo: 90_000 },
        { productId: offlineProvider!.id, tier: "regular", priceKobo: 90_000 },
      ]);
      return { data1: data1!, data2: data2!, airtime: airtime!, noPrice: noPrice! };
    }

    describe("products", () => {
      it("lists only buyable products, at the customer's own tier price", async () => {
        const { userId } = await newUser("reseller");
        const { data1, data2, airtime } = await catalog();
        const products = await listProductsForUser(db, userId);

        // Grouped by network, airtime first, then data plans from cheapest.
        expect(products.map((p) => p.name)).toEqual(["MTN Airtime", "MTN 500MB", "MTN 1GB"]);
        expect(products.find((p) => p.id === data1.id)).toMatchObject({
          category: "data",
          network: "mtn",
          priceKobo: 98_000, // reseller price
          faceValueKobo: 100_000,
          discountBps: null,
        });
        // No reseller row: falls back to the regular price.
        expect(products.find((p) => p.id === data2.id)?.priceKobo).toBe(50_000);
        expect(products.find((p) => p.id === airtime.id)).toMatchObject({
          category: "airtime",
          priceKobo: null,
          discountBps: 100,
        });
      });

      it("never reveals what the provider charges us", async () => {
        const { userId } = await newUser();
        await catalog();
        const products = await listProductsForUser(db, userId);
        for (const p of products) {
          expect(Object.keys(p)).not.toContain("providerPriceKobo");
          expect(Object.keys(p)).not.toContain("providerVariationCode");
        }
      });
    });

    describe("wallet statement", () => {
      it("shows the balance and entries, newest first, a page at a time", async () => {
        const { userId, walletId } = await newUser();
        await credit(db, {
          walletId,
          amountKobo: 500_000,
          reason: "funding",
          referenceId: "f1",
          description: "Bank transfer",
        });
        for (let i = 0; i < 3; i++) {
          await debit(db, {
            walletId,
            amountKobo: 10_000,
            reason: "purchase",
            referenceId: `o${i}`,
            description: `Order ${i}`,
          });
        }

        const page1 = await getWalletStatement(db, userId, { limit: 2, offset: 0 });
        expect(page1.balanceKobo).toBe(470_000);
        expect(page1.entries).toHaveLength(2);
        expect(page1.hasMore).toBe(true);
        expect(page1.entries[0]).toMatchObject({
          direction: "debit",
          amountKobo: 10_000,
          balanceAfterKobo: 470_000,
          description: "Order 2",
        });

        const page2 = await getWalletStatement(db, userId, { limit: 2, offset: 2 });
        expect(page2.entries.map((e) => e.description)).toEqual(["Order 0", "Bank transfer"]);
        expect(page2.hasMore).toBe(false);
      });

      it("hides internal references and who made admin entries", async () => {
        const { userId, walletId } = await newUser();
        await credit(db, {
          walletId,
          amountKobo: 1_000,
          reason: "funding",
          referenceId: "secret-ref",
        });
        const { entries } = await getWalletStatement(db, userId);
        expect(Object.keys(entries[0]!)).not.toContain("referenceId");
        expect(Object.keys(entries[0]!)).not.toContain("createdBy");
      });
    });

    describe("orders", () => {
      async function order(userId: string, walletId: string, productId: string, n: number) {
        const [row] = await db
          .insert(schema.orders)
          .values({
            requestId: `20261114100${n}abc${crypto.randomUUID().slice(0, 6)}`,
            userId,
            walletId,
            productId,
            providerId: "vtpass",
            recipientPhone: "08011111111",
            faceValueKobo: 100_000,
            amountKobo: 100_000,
            status: n % 2 === 0 ? "success" : "failed",
            providerResponse: { secret: "raw provider data" },
          })
          .returning();
        return row!;
      }

      it("lists the customer's own orders with product names, newest first", async () => {
        const me = await newUser();
        const other = await newUser();
        const { data1 } = await catalog();
        await order(me.userId, me.walletId, data1.id, 0);
        await order(me.userId, me.walletId, data1.id, 1);
        await order(other.userId, other.walletId, data1.id, 2);

        const { orders, hasMore } = await listUserOrders(db, me.userId);
        expect(orders).toHaveLength(2);
        expect(hasMore).toBe(false);
        expect(orders[0]).toMatchObject({ productName: "MTN 1GB", status: "failed" });
        expect(orders[0]!.message).toMatch(/refunded|didn't go through/i);
        expect(JSON.stringify(orders)).not.toContain("raw provider data");

        const failedOnly = await listUserOrders(db, me.userId, { status: "failed" });
        expect(failedOnly.orders.map((o) => o.status)).toEqual(["failed"]);
      });

      it("shows a single order only to its owner", async () => {
        const me = await newUser();
        const other = await newUser();
        const { data1 } = await catalog();
        const mine = await order(me.userId, me.walletId, data1.id, 0);

        expect(await getUserOrder(db, me.userId, mine.id)).toMatchObject({
          id: mine.id,
          productName: "MTN 1GB",
        });
        expect(await getUserOrder(db, other.userId, mine.id)).toBeNull();
        expect(await getUserOrder(db, me.userId, crypto.randomUUID())).toBeNull();
      });
    });

    it("returns nothing for a user without a wallet instead of failing", async () => {
      const [user] = await db.insert(schema.users).values({ fullName: "No wallet" }).returning();
      await expect(getWalletStatement(db, user!.id)).resolves.toMatchObject({
        balanceKobo: 0,
        entries: [],
      });
      await db.delete(schema.users).where(eq(schema.users.id, user!.id));
    });
  },
);
