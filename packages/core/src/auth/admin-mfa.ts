// Admin two-step sign-in. After the one-time sign-in code, admins also enter a 6-digit code from
// an authenticator app (or a one-time backup code). A session stays approved for 12 hours.
// - The app secret is stored encrypted; backup codes only as HMACs (like sign-in codes).
// - Codes are checked under a lock on the admin's row, so one code can't be used twice, even by
//   two requests at the same moment.
// - Turning it on, using a backup code and resetting are written to the audit log.
import { createHmac, randomInt } from "node:crypto";

import { type Database, schema } from "@repo/db";
import { and, count, eq, isNull, sql } from "drizzle-orm";

import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from "./totp.ts";

const { adminRecoveryCodes, auditLog, sessions, users } = schema;

/** How long a session stays approved after a code. */
export const MFA_VALID_HOURS = 12;
const RECOVERY_CODE_COUNT = 10;
/** No 0/o, 1/l/i: easy to read back from paper. */
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export type MfaErrorCode = "already_enabled" | "not_started" | "not_enrolled" | "invalid_code";

export class MfaError extends Error {
  readonly code: MfaErrorCode;
  constructor(code: MfaErrorCode, message: string) {
    super(message);
    this.name = "MfaError";
    this.code = code;
  }
}

export interface MfaStatus {
  /** Two-step sign-in is switched on for this admin. */
  enrolled: boolean;
  /** This session passed a code in the last 12 hours. */
  verified: boolean;
  remainingRecoveryCodes: number;
}

function newRecoveryCode(): string {
  const pick = () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  const part = () => Array.from({ length: 5 }, pick).join("");
  return `${part()}-${part()}`;
}

export function createAdminMfa(config: {
  db: Database;
  secret: string;
  /** The name shown in the authenticator app (the brand). Needed only to start setup. */
  issuer?: string;
  now?: () => Date;
}) {
  const { db, secret } = config;
  const now = config.now ?? (() => new Date());
  const hashRecovery = (code: string) =>
    createHmac("sha256", secret)
      .update(`recovery:${code.toLowerCase().replace(/[^a-z0-9]/g, "")}`)
      .digest("hex");

  async function remaining(userId: string, tx: Pick<Database, "select"> = db) {
    const [row] = await tx
      .select({ n: count() })
      .from(adminRecoveryCodes)
      .where(and(eq(adminRecoveryCodes.userId, userId), isNull(adminRecoveryCodes.usedAt)));
    return row?.n ?? 0;
  }

  return {
    async status(userId: string, sessionId: string): Promise<MfaStatus> {
      const [user] = await db
        .select({ enabledAt: users.totpEnabledAt })
        .from(users)
        .where(eq(users.id, userId));
      const [session] = await db
        .select({ verifiedAt: sessions.mfaVerifiedAt })
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
      const enrolled = Boolean(user?.enabledAt);
      const verifiedAt = session?.verifiedAt;
      const fresh =
        !!verifiedAt && now().getTime() - verifiedAt.getTime() < MFA_VALID_HOURS * 60 * 60 * 1000;
      return {
        enrolled,
        verified: enrolled && fresh,
        remainingRecoveryCodes: enrolled ? await remaining(userId) : 0,
      };
    },

    /** Step 1 of setup: a new secret (shown once as a QR code and as text). Not active yet. */
    async startSetup(userId: string): Promise<{ secret: string; uri: string }> {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) throw new MfaError("not_started", "User not found");
      if (user.totpEnabledAt) {
        throw new MfaError(
          "already_enabled",
          "Two-step sign-in is already on. To set it up again, reset it from the laptop.",
        );
      }
      const totpSecret = generateTotpSecret();
      await db
        .update(users)
        .set({
          totpSecretEnc: encryptSecret(totpSecret, secret),
          totpLastStep: null,
          updatedAt: sql`now()`,
        })
        .where(eq(users.id, userId));
      const account = user.email ?? user.phone ?? user.fullName;
      return { secret: totpSecret, uri: otpauthUri(totpSecret, account, config.issuer ?? "Admin") };
    },

    /** Step 2: a correct code proves the app works. Switches it on and returns backup codes once. */
    async confirmSetup(
      userId: string,
      sessionId: string,
      code: string,
    ): Promise<{ recoveryCodes: string[] }> {
      return db.transaction(async (tx) => {
        const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
        if (!user?.totpSecretEnc) throw new MfaError("not_started", "Start the setup first.");
        if (user.totpEnabledAt)
          throw new MfaError("already_enabled", "Two-step sign-in is already on.");
        const step = verifyTotp(decryptSecret(user.totpSecretEnc, secret), code, now());
        if (step === null) {
          throw new MfaError(
            "invalid_code",
            "That code didn’t match. Check your phone’s clock and try the newest code.",
          );
        }
        const at = now();
        await tx
          .update(users)
          .set({ totpEnabledAt: at, totpLastStep: step, updatedAt: sql`now()` })
          .where(eq(users.id, userId));
        const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
        await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.userId, userId));
        await tx
          .insert(adminRecoveryCodes)
          .values(recoveryCodes.map((c) => ({ userId, codeHash: hashRecovery(c) })));
        await tx
          .update(sessions)
          .set({ mfaVerifiedAt: at })
          .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
        await tx.insert(auditLog).values({
          actorUserId: userId,
          action: "admin.2fa_enabled",
          entityType: "user",
          entityId: userId,
          before: { twoStep: false },
          after: { twoStep: true },
        });
        return { recoveryCodes };
      });
    },

    /** Approves this session with an app code or a backup code. */
    async verify(
      userId: string,
      sessionId: string,
      code: string,
    ): Promise<{ method: "app" | "recovery"; remainingRecoveryCodes: number }> {
      return db.transaction(async (tx) => {
        const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
        if (!user?.totpEnabledAt || !user.totpSecretEnc) {
          throw new MfaError("not_enrolled", "Set up two-step sign-in first.");
        }
        const wrong = () =>
          new MfaError("invalid_code", "That code didn’t work. Try the newest code in your app.");
        const at = now();
        let method: "app" | "recovery";
        if (/^\d{6}$/.test(code.replace(/\s/g, ""))) {
          const step = verifyTotp(
            decryptSecret(user.totpSecretEnc, secret),
            code,
            at,
            user.totpLastStep,
          );
          if (step === null) throw wrong();
          await tx.update(users).set({ totpLastStep: step }).where(eq(users.id, userId));
          method = "app";
        } else {
          const [used] = await tx
            .update(adminRecoveryCodes)
            .set({ usedAt: at })
            .where(
              and(
                eq(adminRecoveryCodes.userId, userId),
                eq(adminRecoveryCodes.codeHash, hashRecovery(code)),
                isNull(adminRecoveryCodes.usedAt),
              ),
            )
            .returning({ id: adminRecoveryCodes.id });
          if (!used) throw wrong();
          method = "recovery";
        }
        await tx
          .update(sessions)
          .set({ mfaVerifiedAt: at })
          .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
        const left = await remaining(userId, tx);
        if (method === "recovery") {
          await tx.insert(auditLog).values({
            actorUserId: userId,
            action: "admin.2fa_recovery_code_used",
            entityType: "user",
            entityId: userId,
            after: { remainingRecoveryCodes: left },
          });
        }
        return { method, remainingRecoveryCodes: left };
      });
    },

    /** Turns it off (lost phone). Laptop only: `pnpm admin:reset-2fa`. Audited with no actor. */
    async reset(userId: string, note: string): Promise<void> {
      await db.transaction(async (tx) => {
        const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
        if (!user) throw new MfaError("not_started", "User not found");
        await tx
          .update(users)
          .set({
            totpSecretEnc: null,
            totpEnabledAt: null,
            totpLastStep: null,
            updatedAt: sql`now()`,
          })
          .where(eq(users.id, userId));
        await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.userId, userId));
        await tx.update(sessions).set({ mfaVerifiedAt: null }).where(eq(sessions.userId, userId));
        await tx.insert(auditLog).values({
          actorUserId: null,
          action: "admin.2fa_reset",
          entityType: "user",
          entityId: userId,
          before: { twoStep: Boolean(user.totpEnabledAt) },
          after: { twoStep: false },
          reason: note,
        });
      });
    },
  };
}

export type AdminMfa = ReturnType<typeof createAdminMfa>;
