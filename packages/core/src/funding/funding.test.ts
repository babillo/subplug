// Wallet funding tests: real PostgreSQL (TEST_DATABASE_URL) + a fake gateway standing in for Monnify.
import { type Database, schema } from "@repo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FakeGateway } from "../test/fake-gateway.ts";
import { hasTestDatabase, openTestDb, resetDatabase } from "../test/db.ts";
import { getBalance, getLedgerBalance } from "../wallet/wallet.ts";
import { FUNDING_FEE_FLAT_KOBO, fundingFeeKobo } from "./fees.ts";
import {
  createFundingAccounts,
  FundingError,
  handleFundingWebhook,
  listFundingAccounts,
  reconcileFunding,
} from "./funding.ts";

const FEE = 5_000; // ₦50

describe("fundingFeeKobo", () => {
  it("is a flat ₦50", () => {
    expect(FUNDING_FEE_FLAT_KOBO).toBe(FEE);
    expect(fundingFeeKobo(500_000)).toBe(FEE);
    expect(fundingFeeKobo(5_001)).toBe(FEE);
  });

  it("is waived on deposits of ₦50 or less", () => {
    expect(fundingFeeKobo(5_000)).toBe(0);
    expect(fundingFeeKobo(1)).toBe(0);
  });
});

describe.skipIf(!hasTestDatabase)("wallet funding (real PostgreSQL)", { timeout: 120_000 }, () => {
  let db: Database;
  let close: () => Promise<void>;
  let gateway: FakeGateway;

  beforeAll(() => {
    ({ db, close } = openTestDb());
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await resetDatabase(db);
    gateway = new FakeGateway();
  });

  async function newUser(values: Partial<typeof schema.users.$inferInsert> = {}) {
    const [user] = await db
      .insert(schema.users)
      .values({ fullName: "Ada Obi", email: `${crypto.randomUUID()}@example.test`, ...values })
      .returning();
    const [wallet] = await db.insert(schema.wallets).values({ userId: user!.id }).returning();
    return { userId: user!.id, walletId: wallet!.id };
  }

  /** A user who already has a funding account (accountReference = user id). */
  async function fundedUser() {
    const user = await newUser();
    await createFundingAccounts(db, gateway, { userId: user.userId, bvn: "22222222222" });
    return user;
  }

  const webhook = (transactionReference: string, extra: Record<string, unknown> = {}) => ({
    rawBody: JSON.stringify({
      eventType: "SUCCESSFUL_TRANSACTION",
      eventData: { transactionReference, amountPaid: "5000.00", ...extra },
    }),
    headers: new Headers({ "monnify-signature": gateway.goodSignature }),
  });

  async function expectBalance(walletId: string, kobo: number) {
    expect(await getBalance(db, walletId)).toBe(kobo);
    expect(await getLedgerBalance(db, walletId)).toBe(kobo);
  }

  describe("creating a customer's funding account", () => {
    it("reserves accounts at the gateway and saves the account numbers", async () => {
      const { userId } = await newUser();
      const result = await createFundingAccounts(db, gateway, { userId, bvn: "22222222222" });

      expect(result.created).toBe(true);
      expect(result.accounts).toHaveLength(2);
      expect(result.accounts[0]).toMatchObject({
        userId,
        gateway: "monnify",
        accountReference: userId,
        bankName: "Wema bank",
      });
      expect(gateway.reserved[0]).toMatchObject({
        accountReference: userId,
        customerName: "Ada Obi",
        bvn: "22222222222",
      });
    });

    it("never stores the BVN or NIN", async () => {
      const { userId } = await newUser();
      await createFundingAccounts(db, gateway, { userId, nin: "33333333333" });
      const rows = await db.select().from(schema.fundingAccounts);
      expect(JSON.stringify(rows)).not.toContain("33333333333");
    });

    it("returns the existing accounts on a second request without asking the gateway again", async () => {
      const { userId } = await newUser();
      await createFundingAccounts(db, gateway, { userId, bvn: "22222222222" });
      const again = await createFundingAccounts(db, gateway, { userId, bvn: "22222222222" });
      expect(again.created).toBe(false);
      expect(again.accounts).toHaveLength(2);
      expect(gateway.reserved).toHaveLength(1);
      expect(await listFundingAccounts(db, userId)).toHaveLength(2);
    });

    it.each([
      ["no BVN or NIN", {}, "id_required"],
      ["a BVN that isn't 11 digits", { bvn: "123" }, "id_required"],
    ])("refuses %s before calling the gateway", async (_label, ids, code) => {
      const { userId } = await newUser();
      await expect(createFundingAccounts(db, gateway, { userId, ...ids })).rejects.toMatchObject({
        code,
      });
      expect(gateway.reserved).toHaveLength(0);
    });

    it("refuses a suspended user, an unknown user, and a user with no email", async () => {
      const suspended = await newUser({ status: "suspended" });
      const noEmail = await newUser({ email: null });
      for (const [userId, code] of [
        [suspended.userId, "user_suspended"],
        [crypto.randomUUID(), "user_not_found"],
        [noEmail.userId, "email_required"],
      ] as const) {
        const error = await createFundingAccounts(db, gateway, {
          userId,
          bvn: "22222222222",
        }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(FundingError);
        expect((error as FundingError).code).toBe(code);
      }
      expect(gateway.reserved).toHaveLength(0);
    });
  });

  describe("webhook: money received", () => {
    it("checks the signature, confirms with the gateway, then credits the wallet once", async () => {
      const { userId, walletId } = await fundedUser();
      gateway.payments.set("MNFY|1", { amountKobo: 500_000, accountReference: userId });

      const result = await handleFundingWebhook(db, gateway, webhook("MNFY|1"));

      expect(result).toMatchObject({
        httpStatus: 200,
        outcome: "credited",
        amountKobo: 500_000,
        feeKobo: FEE,
        creditedKobo: 495_000,
      });
      expect(gateway.verified).toEqual(["MNFY|1"]);
      await expectBalance(walletId, 495_000); // ₦5,000 received − ₦50 fee
      const [event] = await db.select().from(schema.fundingEvents);
      expect(event).toMatchObject({
        gateway: "monnify",
        gatewayReference: "MNFY|1",
        amountKobo: 500_000,
        feeKobo: FEE,
      });
      const [entry] = await db
        .select()
        .from(schema.ledgerEntries)
        .where(eq(schema.ledgerEntries.walletId, walletId));
      expect(entry).toMatchObject({
        reason: "funding",
        referenceId: event!.id,
        amountKobo: 495_000,
      });
      expect(entry!.description).toContain("₦50.00 fee");
    });

    it("a repeated webhook credits only once", async () => {
      const { userId, walletId } = await fundedUser();
      gateway.payments.set("MNFY|2", { amountKobo: 500_000, accountReference: userId });
      await handleFundingWebhook(db, gateway, webhook("MNFY|2"));
      const again = await handleFundingWebhook(db, gateway, webhook("MNFY|2"));

      expect(again).toMatchObject({ httpStatus: 200, outcome: "duplicate" });
      await expectBalance(walletId, 495_000);
    });

    it("five copies of the same webhook at the same moment credit only once", async () => {
      const { userId, walletId } = await fundedUser();
      gateway.payments.set("MNFY|3", { amountKobo: 500_000, accountReference: userId });
      const results = await Promise.all(
        Array.from({ length: 5 }, () => handleFundingWebhook(db, gateway, webhook("MNFY|3"))),
      );
      expect(results.filter((r) => r.outcome === "credited")).toHaveLength(1);
      expect(results.filter((r) => r.outcome === "duplicate")).toHaveLength(4);
      await expectBalance(walletId, 495_000);
    });

    it("credits the amount the gateway confirms, never the amount the webhook claims", async () => {
      const { userId, walletId } = await fundedUser();
      gateway.payments.set("MNFY|4", { amountKobo: 100_000, accountReference: userId });
      await handleFundingWebhook(db, gateway, webhook("MNFY|4", { amountPaid: "1000000.00" }));
      await expectBalance(walletId, 95_000);
    });

    it("rejects a bad signature with 401, without asking the gateway or crediting", async () => {
      const { userId, walletId } = await fundedUser();
      gateway.payments.set("MNFY|5", { amountKobo: 500_000, accountReference: userId });
      const forged = {
        ...webhook("MNFY|5"),
        headers: new Headers({ "monnify-signature": "forged" }),
      };

      const result = await handleFundingWebhook(db, gateway, forged);
      expect(result).toMatchObject({ httpStatus: 401, outcome: "rejected" });
      expect(gateway.verified).toHaveLength(0);
      await expectBalance(walletId, 0);
    });

    it("credits nothing when the gateway says the payment isn't complete", async () => {
      const { userId, walletId } = await fundedUser();
      gateway.payments.set("MNFY|6", {
        amountKobo: 500_000,
        accountReference: userId,
        status: "PENDING",
      });
      const result = await handleFundingWebhook(db, gateway, webhook("MNFY|6"));
      expect(result).toMatchObject({ httpStatus: 200, outcome: "not_paid" });
      await expectBalance(walletId, 0);
    });

    it("credits nothing for a transaction the gateway doesn't know (a forged reference)", async () => {
      const { walletId } = await fundedUser();
      const result = await handleFundingWebhook(db, gateway, webhook("MNFY|made-up"));
      expect(result.outcome).toBe("not_paid");
      await expectBalance(walletId, 0);
    });

    it("credits nothing when the money went to an account we don't know", async () => {
      const { walletId } = await fundedUser();
      gateway.payments.set("MNFY|7", { amountKobo: 500_000, accountReference: "someone-else" });
      const result = await handleFundingWebhook(db, gateway, webhook("MNFY|7"));
      expect(result).toMatchObject({ httpStatus: 200, outcome: "unknown_account" });
      await expectBalance(walletId, 0);
    });

    it("ignores events that aren't payments, without asking the gateway", async () => {
      await fundedUser();
      const result = await handleFundingWebhook(db, gateway, {
        rawBody: JSON.stringify({ eventType: "SUCCESSFUL_DISBURSEMENT", eventData: {} }),
        headers: new Headers({ "monnify-signature": gateway.goodSignature }),
      });
      expect(result).toMatchObject({ httpStatus: 200, outcome: "ignored" });
      expect(gateway.verified).toHaveLength(0);
    });

    it("answers 500 when the gateway can't confirm, so it retries later, and credits nothing", async () => {
      const { userId, walletId } = await fundedUser();
      gateway.payments.set("MNFY|8", { amountKobo: 500_000, accountReference: userId });
      gateway.verifyError = new Error("Monnify unreachable");
      const result = await handleFundingWebhook(db, gateway, webhook("MNFY|8"));
      expect(result).toMatchObject({ httpStatus: 500, outcome: "error" });
      await expectBalance(walletId, 0);
    });

    it("credits separate payments separately", async () => {
      const { userId, walletId } = await fundedUser();
      gateway.payments.set("A", { amountKobo: 100_000, accountReference: userId });
      gateway.payments.set("B", { amountKobo: 250_000, accountReference: userId });
      await handleFundingWebhook(db, gateway, webhook("A"));
      await handleFundingWebhook(db, gateway, webhook("B"));
      await expectBalance(walletId, 340_000); // (₦1,000 − ₦50) + (₦2,500 − ₦50)
    });

    it("charges no fee on a deposit of ₦50 or less, so the customer never receives ₦0", async () => {
      const { userId, walletId } = await fundedUser();
      gateway.payments.set("TINY", { amountKobo: 5_000, accountReference: userId });
      const result = await handleFundingWebhook(db, gateway, webhook("TINY"));
      expect(result).toMatchObject({ outcome: "credited", feeKobo: 0, creditedKobo: 5_000 });
      await expectBalance(walletId, 5_000);
    });

    it("charges the fee on a deposit just above ₦50", async () => {
      const { userId, walletId } = await fundedUser();
      gateway.payments.set("SMALL", { amountKobo: 5_001, accountReference: userId });
      await handleFundingWebhook(db, gateway, webhook("SMALL"));
      await expectBalance(walletId, 1);
    });
  });

  describe("backup job: payments whose webhook never arrived", () => {
    it("credits missed payments, skips ones already credited, and never double-credits", async () => {
      const { userId, walletId } = await fundedUser();
      gateway.payments.set("SEEN", { amountKobo: 100_000, accountReference: userId });
      gateway.payments.set("MISSED", { amountKobo: 200_000, accountReference: userId });
      gateway.payments.set("NOT-YET", {
        amountKobo: 50_000,
        accountReference: userId,
        status: "PENDING",
      });
      await handleFundingWebhook(db, gateway, webhook("SEEN"));
      gateway.accountPayments.set(userId, ["SEEN", "MISSED", "NOT-YET"]);
      gateway.verified.length = 0;

      const summary = await reconcileFunding(db, gateway);
      expect(summary).toMatchObject({
        accounts: 1,
        listed: 3,
        checked: 2,
        credited: 1,
        notPaid: 1,
        errors: 0,
      });
      expect(gateway.verified).toEqual(["MISSED", "NOT-YET"]); // "SEEN" skipped: already recorded
      await expectBalance(walletId, 290_000);

      const again = await reconcileFunding(db, gateway);
      expect(again.credited).toBe(0);
      await expectBalance(walletId, 290_000);
    });

    it("keeps going when one account fails", async () => {
      const a = await fundedUser();
      const b = await fundedUser();
      gateway.payments.set("PB", { amountKobo: 100_000, accountReference: b.userId });
      gateway.accountPayments.set(b.userId, ["PB"]);
      const original = gateway.listAccountPayments.bind(gateway);
      gateway.listAccountPayments = async (ref: string) => {
        if (ref === a.userId) throw new Error("boom");
        return original(ref);
      };

      const summary = await reconcileFunding(db, gateway, { log: () => {} });
      expect(summary).toMatchObject({ accounts: 2, credited: 1, errors: 1 });
      await expectBalance(b.walletId, 95_000);
    });
  });
});
