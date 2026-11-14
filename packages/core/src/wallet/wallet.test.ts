// Wallet ledger tests. They run against a real PostgreSQL (TEST_DATABASE_URL), because the thing
// being tested, row locking under concurrent requests, only exists in a real database.
import { type Database, schema } from "@repo/db";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hasTestDatabase, openTestDb, resetDatabase } from "../test/db.ts";
import {
  credit,
  debit,
  getBalance,
  getLedgerBalance,
  InsufficientFundsError,
  recordFunding,
  WalletNotFoundError,
} from "./wallet.ts";

// Generous limits: against a remote database (e.g. Neon from the laptop) every query is a network
// round trip, and the concurrency tests make requests queue behind the wallet lock on purpose.
describe.skipIf(!hasTestDatabase)("wallet ledger (real PostgreSQL)", { timeout: 120_000 }, () => {
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

  /** Creates a user with an empty wallet, then optionally funds it through the ledger. */
  async function newWallet(startKobo = 0) {
    const [user] = await db
      .insert(schema.users)
      .values({ fullName: "Test User", email: `${crypto.randomUUID()}@example.test` })
      .returning();
    const [wallet] = await db.insert(schema.wallets).values({ userId: user!.id }).returning();
    if (startKobo > 0) {
      await credit(db, { walletId: wallet!.id, amountKobo: startKobo, reason: "seed" });
    }
    return { userId: user!.id, walletId: wallet!.id };
  }

  async function entriesOf(walletId: string) {
    return db
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.walletId, walletId))
      .orderBy(asc(schema.ledgerEntries.createdAt), asc(schema.ledgerEntries.balanceAfterKobo));
  }

  /** The core invariant: cached balance == sum of the ledger, and it never goes negative. */
  async function expectConsistent(walletId: string) {
    const cached = await getBalance(db, walletId);
    const fromLedger = await getLedgerBalance(db, walletId);
    expect(cached).toBe(fromLedger);
    expect(cached).toBeGreaterThanOrEqual(0);
    return cached;
  }

  describe("credit and debit", () => {
    it("credit adds to the balance and writes a ledger entry with balance_after", async () => {
      const { walletId } = await newWallet();
      const result = await credit(db, {
        walletId,
        amountKobo: 500_000,
        reason: "funding",
        referenceId: "fund-1",
        description: "Bank transfer",
      });

      expect(result.duplicate).toBe(false);
      expect(result.entry).toMatchObject({
        walletId,
        direction: "credit",
        amountKobo: 500_000,
        balanceAfterKobo: 500_000,
        reason: "funding",
        referenceId: "fund-1",
        description: "Bank transfer",
      });
      expect(await expectConsistent(walletId)).toBe(500_000);
    });

    it("debit subtracts from the balance", async () => {
      const { walletId } = await newWallet(500_000);
      const result = await debit(db, {
        walletId,
        amountKobo: 120_000,
        reason: "purchase",
        referenceId: "order-1",
      });
      expect(result.entry).toMatchObject({
        direction: "debit",
        amountKobo: 120_000,
        balanceAfterKobo: 380_000,
      });
      expect(await expectConsistent(walletId)).toBe(380_000);
    });

    it("can spend the whole balance down to exactly zero", async () => {
      const { walletId } = await newWallet(100_000);
      await debit(db, { walletId, amountKobo: 100_000, reason: "purchase", referenceId: "o" });
      expect(await expectConsistent(walletId)).toBe(0);
    });

    it("refuses a debit larger than the balance and writes nothing", async () => {
      const { walletId } = await newWallet(100_000);
      const error = await debit(db, {
        walletId,
        amountKobo: 100_001,
        reason: "purchase",
        referenceId: "order-too-big",
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InsufficientFundsError);
      expect(error).toMatchObject({ balanceKobo: 100_000, requestedKobo: 100_001 });
      expect(await entriesOf(walletId)).toHaveLength(1); // only the seed credit
      expect(await expectConsistent(walletId)).toBe(100_000);
    });

    it.each([0, -100, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2])(
      "refuses the amount %s and writes nothing",
      async (amountKobo) => {
        const { walletId } = await newWallet(100_000);
        await expect(credit(db, { walletId, amountKobo, reason: "funding" })).rejects.toThrow();
        await expect(debit(db, { walletId, amountKobo, reason: "purchase" })).rejects.toThrow();
        expect(await entriesOf(walletId)).toHaveLength(1);
      },
    );

    it("refuses a reason that points the wrong way", async () => {
      const { walletId } = await newWallet(100_000);
      // @ts-expect-error: "purchase" is a debit reason
      await expect(credit(db, { walletId, amountKobo: 100, reason: "purchase" })).rejects.toThrow(
        TypeError,
      );
      // @ts-expect-error: "refund" is a credit reason
      await expect(debit(db, { walletId, amountKobo: 100, reason: "refund" })).rejects.toThrow(
        TypeError,
      );
    });

    it("throws WalletNotFoundError for an unknown wallet", async () => {
      await expect(
        credit(db, { walletId: crypto.randomUUID(), amountKobo: 100, reason: "funding" }),
      ).rejects.toBeInstanceOf(WalletNotFoundError);
    });
  });

  describe("concurrency: the wallet row lock", () => {
    it("two debits at the same time can't overspend", async () => {
      const { walletId } = await newWallet(500_000); // ₦5,000
      const results = await Promise.allSettled([
        debit(db, { walletId, amountKobo: 300_000, reason: "purchase", referenceId: "a" }),
        debit(db, { walletId, amountKobo: 300_000, reason: "purchase", referenceId: "b" }),
      ]);

      const ok = results.filter((r) => r.status === "fulfilled");
      const refused = results.filter((r) => r.status === "rejected");
      expect(ok).toHaveLength(1);
      expect(refused).toHaveLength(1);
      expect((refused[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientFundsError);
      expect(await expectConsistent(walletId)).toBe(200_000);
    });

    it("ten ₦1,000 debits at once on ₦5,000: exactly five succeed and the balance ends at ₦0", async () => {
      const { walletId } = await newWallet(500_000);
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          debit(db, { walletId, amountKobo: 100_000, reason: "purchase", referenceId: `o-${i}` }),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
      for (const r of results.filter((r) => r.status === "rejected")) {
        expect((r as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientFundsError);
      }
      expect(await expectConsistent(walletId)).toBe(0);
    });

    it("credits and debits racing on one wallet all land, with a consistent statement", async () => {
      const { walletId } = await newWallet(1_000_000);
      await Promise.all([
        ...Array.from({ length: 10 }, (_, i) =>
          credit(db, { walletId, amountKobo: 10_000, reason: "funding", referenceId: `f-${i}` }),
        ),
        ...Array.from({ length: 10 }, (_, i) =>
          debit(db, { walletId, amountKobo: 20_000, reason: "purchase", referenceId: `p-${i}` }),
        ),
      ]);
      expect(await expectConsistent(walletId)).toBe(1_000_000 + 100_000 - 200_000);
    });

    it("a lock on one wallet doesn't block or affect another wallet", async () => {
      const a = await newWallet(100_000);
      const b = await newWallet(100_000);
      await Promise.all([
        debit(db, {
          walletId: a.walletId,
          amountKobo: 100_000,
          reason: "purchase",
          referenceId: "x",
        }),
        debit(db, {
          walletId: b.walletId,
          amountKobo: 100_000,
          reason: "purchase",
          referenceId: "y",
        }),
      ]);
      expect(await expectConsistent(a.walletId)).toBe(0);
      expect(await expectConsistent(b.walletId)).toBe(0);
    });
  });

  describe("idempotency: the same reference never moves money twice", () => {
    it("charges an order once, even when the debit is retried", async () => {
      const { walletId } = await newWallet(500_000);
      const input = {
        walletId,
        amountKobo: 100_000,
        reason: "purchase",
        referenceId: "order-9",
      } as const;
      const first = await debit(db, input);
      const retry = await debit(db, input);

      expect(first.duplicate).toBe(false);
      expect(retry.duplicate).toBe(true);
      expect(retry.entry.id).toBe(first.entry.id);
      expect(await expectConsistent(walletId)).toBe(400_000);
    });

    it("charges an order once when the same debit arrives five times at once", async () => {
      const { walletId } = await newWallet(500_000);
      const input = {
        walletId,
        amountKobo: 100_000,
        reason: "purchase",
        referenceId: "order-x",
      } as const;
      const results = await Promise.all(Array.from({ length: 5 }, () => debit(db, input)));
      expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
      expect(new Set(results.map((r) => r.entry.id)).size).toBe(1);
      expect(await expectConsistent(walletId)).toBe(400_000);
    });

    it("refunds an order once", async () => {
      const { walletId } = await newWallet(500_000);
      await debit(db, {
        walletId,
        amountKobo: 100_000,
        reason: "purchase",
        referenceId: "order-r",
      });
      const refund = {
        walletId,
        amountKobo: 100_000,
        reason: "refund",
        referenceId: "order-r",
      } as const;
      await Promise.all([credit(db, refund), credit(db, refund), credit(db, refund)]);
      expect(await expectConsistent(walletId)).toBe(500_000);
    });

    it("refuses a reused reference with a different amount (a bug, not a retry)", async () => {
      const { walletId } = await newWallet(500_000);
      await debit(db, {
        walletId,
        amountKobo: 100_000,
        reason: "purchase",
        referenceId: "order-m",
      });
      await expect(
        debit(db, { walletId, amountKobo: 200_000, reason: "purchase", referenceId: "order-m" }),
      ).rejects.toThrow(/order-m/);
      expect(await expectConsistent(walletId)).toBe(400_000);
    });
  });

  describe("funding: a duplicate gateway reference credits only once", () => {
    const funding = (walletId: string, gatewayReference = "MNFY|2026|0001") => ({
      walletId,
      gateway: "monnify",
      gatewayReference,
      amountKobo: 250_000,
      raw: { eventType: "SUCCESSFUL_TRANSACTION" },
    });

    it("credits the wallet and records the funding event", async () => {
      const { walletId } = await newWallet();
      const result = await recordFunding(db, funding(walletId));
      expect(result.duplicate).toBe(false);
      expect(result.entry).toMatchObject({ reason: "funding", amountKobo: 250_000 });
      expect(result.entry.referenceId).toBe(result.fundingEvent.id);
      expect(result.fundingEvent).toMatchObject({
        status: "credited",
        gatewayReference: "MNFY|2026|0001",
      });
      expect(await expectConsistent(walletId)).toBe(250_000);
    });

    it("a repeated webhook for the same payment credits once", async () => {
      const { walletId } = await newWallet();
      const first = await recordFunding(db, funding(walletId));
      const second = await recordFunding(db, funding(walletId));
      expect(second.duplicate).toBe(true);
      expect(second.entry.id).toBe(first.entry.id);
      expect(await db.select().from(schema.fundingEvents)).toHaveLength(1);
      expect(await expectConsistent(walletId)).toBe(250_000);
    });

    it("five copies of the same webhook at the same moment credit once", async () => {
      const { walletId } = await newWallet();
      const results = await Promise.all(
        Array.from({ length: 5 }, () => recordFunding(db, funding(walletId))),
      );
      expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
      expect(await expectConsistent(walletId)).toBe(250_000);
    });

    it("different payments are all credited", async () => {
      const { walletId } = await newWallet();
      await recordFunding(db, funding(walletId, "ref-1"));
      await recordFunding(db, funding(walletId, "ref-2"));
      await recordFunding(db, { ...funding(walletId, "ref-1"), gateway: "paystack" });
      expect(await expectConsistent(walletId)).toBe(750_000);
    });

    it("refuses a duplicate reference that claims a different amount or wallet", async () => {
      const a = await newWallet();
      const b = await newWallet();
      await recordFunding(db, funding(a.walletId));
      await expect(
        recordFunding(db, { ...funding(a.walletId), amountKobo: 999_999 }),
      ).rejects.toThrow();
      await expect(recordFunding(db, funding(b.walletId))).rejects.toThrow();
      expect(await expectConsistent(a.walletId)).toBe(250_000);
      expect(await expectConsistent(b.walletId)).toBe(0);
    });
  });

  describe("the balance always equals the sum of ledger entries", () => {
    it("holds after 60 random credits and debits, and every balance_after chains correctly", async () => {
      const { walletId } = await newWallet();
      let seed = 42; // fixed seed: the same "random" sequence every run
      const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
      let expected = 0;

      for (let i = 0; i < 60; i++) {
        const amountKobo = 1 + Math.floor(random() * 50_000);
        if (random() < 0.5) {
          await credit(db, { walletId, amountKobo, reason: "funding", referenceId: `c${i}` });
          expected += amountKobo;
        } else {
          try {
            await debit(db, { walletId, amountKobo, reason: "purchase", referenceId: `d${i}` });
            expected -= amountKobo;
          } catch (error) {
            expect(error).toBeInstanceOf(InsufficientFundsError);
          }
        }
        if (i % 15 === 0) expect(await expectConsistent(walletId)).toBe(expected);
      }
      expect(await expectConsistent(walletId)).toBe(expected);

      // Walk the statement: each balance_after = previous balance_after ± amount.
      let running = 0;
      for (const entry of await entriesOf(walletId)) {
        running += entry.direction === "credit" ? entry.amountKobo : -entry.amountKobo;
        expect(entry.balanceAfterKobo).toBe(running);
      }
    });
  });

  describe("admin entries are audited", () => {
    it("requires the admin's id and writes before/after values to audit_log", async () => {
      const { walletId } = await newWallet(100_000);
      const { userId: adminId } = await newWallet();

      await expect(
        credit(db, { walletId, amountKobo: 5_000, reason: "admin_credit" }),
      ).rejects.toThrow(/createdBy/);

      await credit(db, {
        walletId,
        amountKobo: 5_000,
        reason: "admin_credit",
        createdBy: adminId,
        description: "Goodwill for delayed order",
      });
      await debit(db, { walletId, amountKobo: 2_000, reason: "admin_debit", createdBy: adminId });

      const audits = await db
        .select()
        .from(schema.auditLog)
        .orderBy(asc(schema.auditLog.createdAt));
      expect(audits).toHaveLength(2);
      expect(audits[0]).toMatchObject({
        actorUserId: adminId,
        action: "wallet.admin_credit",
        entityType: "wallet",
        entityId: walletId,
        before: { balanceKobo: 100_000 },
        after: { balanceKobo: 105_000 },
        reason: "Goodwill for delayed order",
      });
      expect(audits[1]).toMatchObject({
        action: "wallet.admin_debit",
        before: { balanceKobo: 105_000 },
        after: { balanceKobo: 103_000 },
      });
      expect(await expectConsistent(walletId)).toBe(103_000);
    });
  });

  describe("database safety nets (even if code is wrong)", () => {
    it("the database refuses a negative wallet balance", async () => {
      const { walletId } = await newWallet();
      await expect(
        db.execute(sql`update wallets set balance_kobo = -1 where id = ${walletId}`),
      ).rejects.toThrow();
    });

    it("the database refuses a second funding row with the same gateway reference", async () => {
      const { walletId } = await newWallet();
      const row = {
        walletId,
        gateway: "monnify",
        gatewayReference: "dup",
        amountKobo: 100,
        status: "credited" as const,
      };
      await db.insert(schema.fundingEvents).values(row);
      await expect(db.insert(schema.fundingEvents).values(row)).rejects.toThrow();
    });

    it("the database refuses a second order with the same request_id", async () => {
      const { userId, walletId } = await newWallet();
      await db.insert(schema.providers).values({ id: "vtpass", name: "VTpass" });
      const [product] = await db
        .insert(schema.products)
        .values({
          category: "airtime",
          network: "mtn",
          name: "MTN Airtime",
          providerId: "vtpass",
          providerServiceId: "mtn",
        })
        .returning();
      const order = {
        requestId: "202611141005abc",
        userId,
        walletId,
        productId: product!.id,
        providerId: "vtpass",
        recipientPhone: "08011111111",
        faceValueKobo: 10_000,
        amountKobo: 9_800,
      };
      await db.insert(schema.orders).values(order);
      await expect(db.insert(schema.orders).values(order)).rejects.toThrow();
    });
  });
});
