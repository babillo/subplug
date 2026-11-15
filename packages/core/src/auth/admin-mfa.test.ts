// Admin two-step sign-in: setup, checking codes, backup codes, expiry and laptop reset.
import { type Database, schema } from "@repo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hasTestDatabase, openTestDb, resetDatabase } from "../test/db.ts";
import { createAdminMfa, MfaError } from "./admin-mfa.ts";
import { totpAt } from "./totp.ts";

const SECRET = "test-auth-secret-at-least-32-characters-long";

describe.skipIf(!hasTestDatabase)(
  "admin two-step sign-in (real PostgreSQL)",
  { timeout: 60_000 },
  () => {
    let db: Database;
    let close: () => Promise<void>;
    let clock: Date;
    const step = () => Math.floor(clock.getTime() / 1000 / 30);

    beforeAll(() => {
      ({ db, close } = openTestDb());
    });
    afterAll(async () => {
      await close();
    });
    beforeEach(async () => {
      await resetDatabase(db);
      clock = new Date("2026-11-15T10:00:00Z");
    });

    const mfa = () => createAdminMfa({ db, secret: SECRET, issuer: "SubPlug", now: () => clock });

    async function adminWithSession() {
      const [user] = await db
        .insert(schema.users)
        .values({
          fullName: "Ada Admin",
          email: `${crypto.randomUUID()}@example.test`,
          role: "admin",
        })
        .returning();
      const newSession = async () => {
        const [s] = await db
          .insert(schema.sessions)
          .values({
            userId: user!.id,
            tokenHash: crypto.randomUUID(),
            expiresAt: new Date("2027-01-01"),
          })
          .returning();
        return s!.id;
      };
      return { userId: user!.id, sessionId: await newSession(), newSession };
    }

    async function enrolled() {
      const a = await adminWithSession();
      const { secret } = await mfa().startSetup(a.userId);
      const { recoveryCodes } = await mfa().confirmSetup(
        a.userId,
        a.sessionId,
        totpAt(secret, step()),
      );
      return { ...a, secret, recoveryCodes };
    }

    const audits = () => db.select().from(schema.auditLog);

    it("is off until setup is confirmed with a correct code", async () => {
      const a = await adminWithSession();
      expect(await mfa().status(a.userId, a.sessionId)).toMatchObject({
        enrolled: false,
        verified: false,
      });

      const { secret, uri } = await mfa().startSetup(a.userId);
      expect(uri).toContain(`secret=${secret}`);
      expect(uri).toContain("issuer=SubPlug");
      // The stored secret is encrypted, never readable.
      const [row] = await db.select().from(schema.users).where(eq(schema.users.id, a.userId));
      expect(row!.totpSecretEnc).toMatch(/^v1:/);
      expect(row!.totpSecretEnc).not.toContain(secret);
      expect(row!.totpEnabledAt).toBeNull();

      await expect(mfa().confirmSetup(a.userId, a.sessionId, "000000")).rejects.toMatchObject({
        code: "invalid_code",
      });
      expect(await mfa().status(a.userId, a.sessionId)).toMatchObject({ enrolled: false });

      const { recoveryCodes } = await mfa().confirmSetup(
        a.userId,
        a.sessionId,
        totpAt(secret, step()),
      );
      expect(recoveryCodes).toHaveLength(10);
      expect(new Set(recoveryCodes).size).toBe(10);
      recoveryCodes.forEach((c) => expect(c).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/));
      expect(await mfa().status(a.userId, a.sessionId)).toMatchObject({
        enrolled: true,
        verified: true,
        remainingRecoveryCodes: 10,
      });
      // Backup codes are stored only as hashes.
      const stored = await db.select().from(schema.adminRecoveryCodes);
      expect(stored.map((r) => r.codeHash)).not.toContain(recoveryCodes[0]);
      expect((await audits()).map((x) => x.action)).toContain("admin.2fa_enabled");
    });

    it("can't start setup again once it's on (reset from the laptop instead)", async () => {
      const a = await enrolled();
      await expect(mfa().startSetup(a.userId)).rejects.toBeInstanceOf(MfaError);
    });

    it("a new session needs a code; the same code can't be used twice", async () => {
      const a = await enrolled();
      const second = await a.newSession();
      expect(await mfa().status(a.userId, second)).toMatchObject({
        enrolled: true,
        verified: false,
      });

      clock = new Date(clock.getTime() + 60_000); // a minute later: a fresh code
      const code = totpAt(a.secret, step());
      expect(await mfa().verify(a.userId, second, code)).toMatchObject({ method: "app" });
      expect(await mfa().status(a.userId, second)).toMatchObject({ verified: true });

      const third = await a.newSession();
      await expect(mfa().verify(a.userId, third, code)).rejects.toMatchObject({
        code: "invalid_code",
      });
      await expect(mfa().verify(a.userId, third, "123456")).rejects.toMatchObject({
        code: "invalid_code",
      });
    });

    it("the same code sent twice at the same moment only works once", async () => {
      const a = await enrolled();
      clock = new Date(clock.getTime() + 60_000);
      const code = totpAt(a.secret, step());
      const [s1, s2] = [await a.newSession(), await a.newSession()];
      const results = await Promise.allSettled([
        mfa().verify(a.userId, s1, code),
        mfa().verify(a.userId, s2, code),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    });

    it("a backup code works once, and its use is audited", async () => {
      const a = await enrolled();
      const second = await a.newSession();
      const result = await mfa().verify(a.userId, second, a.recoveryCodes[3]!.toUpperCase());
      expect(result).toMatchObject({ method: "recovery", remainingRecoveryCodes: 9 });
      const third = await a.newSession();
      await expect(mfa().verify(a.userId, third, a.recoveryCodes[3]!)).rejects.toMatchObject({
        code: "invalid_code",
      });
      expect((await audits()).map((x) => x.action)).toContain("admin.2fa_recovery_code_used");
    });

    it("approval lasts 12 hours", async () => {
      const a = await enrolled();
      clock = new Date(clock.getTime() + 11 * 60 * 60 * 1000);
      expect(await mfa().status(a.userId, a.sessionId)).toMatchObject({ verified: true });
      clock = new Date(clock.getTime() + 2 * 60 * 60 * 1000);
      expect(await mfa().status(a.userId, a.sessionId)).toMatchObject({ verified: false });
    });

    it("checking a code before setup is refused", async () => {
      const a = await adminWithSession();
      await expect(mfa().verify(a.userId, a.sessionId, "123456")).rejects.toMatchObject({
        code: "not_enrolled",
      });
    });

    it("a laptop reset turns it off everywhere, audited with no actor", async () => {
      const a = await enrolled();
      await mfa().reset(a.userId, "Lost phone");
      expect(await mfa().status(a.userId, a.sessionId)).toMatchObject({
        enrolled: false,
        verified: false,
      });
      expect(await db.select().from(schema.adminRecoveryCodes)).toHaveLength(0);
      const log = (await audits()).find((x) => x.action === "admin.2fa_reset");
      expect(log).toMatchObject({ actorUserId: null, entityId: a.userId, reason: "Lost phone" });
      // Setup can start again.
      await expect(mfa().startSetup(a.userId)).resolves.toBeTruthy();
    });
  },
);
