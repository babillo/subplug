// Sign-in with one-time codes, sessions, and the transaction PIN.
//
// One-time codes: 6 digits, valid 10 minutes, 5 tries, one per minute and 5 per hour per
// destination. Only an HMAC of the code (keyed with AUTH_SECRET) is stored. Only the newest unused
// code for a destination + purpose works, and only for its purpose (sign-in vs PIN reset).
//
// Sessions: a random 256-bit token held by the customer (web: secure cookie; mobile: header).
// We store its SHA-256 hash. Sessions last 30 days and stop working if the account is suspended.
//
// PIN: see pin.ts. Wrong tries are counted in the database under a row lock, so the 5-try lock
// holds across devices, simultaneous requests and server restarts.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { type DbOrTx, schema } from "@repo/db";
import { normaliseNigerianPhone } from "@repo/shared/orders";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { AuthError } from "./errors.ts";
import { checkPinFormat, hashPin, PIN_MAX_ATTEMPTS, pinMatches } from "./pin.ts";
import type { OtpSender } from "./types.ts";

export { AuthError } from "./errors.ts";

const { otpCodes, sessions, users, wallets } = schema;

export type User = typeof users.$inferSelect;
type Purpose = "sign_in" | "pin_reset";

const CODE_TTL_SECONDS = 10 * 60;
const CODE_MAX_ATTEMPTS = 5;
const RESEND_WAIT_SECONDS = 60;
const MAX_CODES_PER_HOUR = 5;
const SESSION_DAYS = 30;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthConfig {
  db: DbOrTx;
  sender: OtpSender;
  /** Server secret for hashing one-time codes (AUTH_SECRET). At least 32 characters. */
  secret: string;
}

export type SignInResult =
  | { status: "signed_in"; token: string; user: User; expiresAt: Date }
  | { status: "profile_required" };

/** Turns what the customer typed into a channel + normalised destination, or throws. */
export function normaliseDestination(input: string): {
  channel: "sms" | "email";
  destination: string;
} {
  const trimmed = input.trim();
  if (trimmed.includes("@")) {
    const email = trimmed.toLowerCase();
    if (!EMAIL.test(email))
      throw new AuthError("invalid_destination", "Enter a valid email address");
    return { channel: "email", destination: email };
  }
  const phone = normaliseNigerianPhone(trimmed);
  if (!phone) {
    throw new AuthError(
      "invalid_destination",
      "Enter a valid Nigerian phone number (e.g. 08031234567) or an email address",
    );
  }
  return { channel: "sms", destination: phone };
}

export function createAuthService(config: AuthConfig) {
  const { db, sender, secret } = config;
  if (secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");

  const hashCode = (purpose: Purpose, destination: string, code: string) =>
    createHmac("sha256", secret).update(`${purpose}:${destination}:${code}`).digest("hex");
  const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

  /** Sends a code. Throws rate_limited if asked too often. */
  async function sendCode(destination: string, channel: "sms" | "email", purpose: Purpose) {
    const [recent] = await db
      .select({
        lastAgeSeconds: sql<
          string | null
        >`extract(epoch from now() - max(${otpCodes.createdAt}))::text`,
        lastHour: sql<string>`count(*)::text`,
      })
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.destination, destination),
          eq(otpCodes.purpose, purpose),
          gt(otpCodes.createdAt, sql`now() - interval '1 hour'`),
        ),
      );
    const lastAge = recent?.lastAgeSeconds == null ? null : Number(recent.lastAgeSeconds);
    if (lastAge !== null && lastAge < RESEND_WAIT_SECONDS) {
      const wait = Math.max(1, Math.ceil(RESEND_WAIT_SECONDS - lastAge));
      throw new AuthError(
        "rate_limited",
        `Please wait ${wait} seconds before asking for another code`,
        {
          retryAfterSeconds: wait,
        },
      );
    }
    if (Number(recent?.lastHour ?? 0) >= MAX_CODES_PER_HOUR) {
      throw new AuthError(
        "rate_limited",
        "Too many codes requested. Please try again in an hour.",
        {
          retryAfterSeconds: 3600,
        },
      );
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await db.insert(otpCodes).values({
      channel,
      destination,
      purpose,
      codeHash: hashCode(purpose, destination, code),
      expiresAt: sql`now() + make_interval(secs => ${CODE_TTL_SECONDS})`,
    });
    await sender.send({ channel, destination, code, purpose });
    return {
      channel,
      destination,
      retryAfterSeconds: RESEND_WAIT_SECONDS,
      expiresInSeconds: CODE_TTL_SECONDS,
    };
  }

  /**
   * Checks a code against the newest unused one for this destination + purpose. A wrong guess is
   * counted (and saved) before this returns. Returns the code's id when correct.
   */
  async function checkCode(destination: string, purpose: Purpose, code: string): Promise<string> {
    const outcome = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(otpCodes)
        .where(
          and(
            eq(otpCodes.destination, destination),
            eq(otpCodes.purpose, purpose),
            isNull(otpCodes.consumedAt),
            gt(otpCodes.expiresAt, sql`now()`),
          ),
        )
        .orderBy(desc(otpCodes.createdAt))
        .limit(1)
        .for("update");
      if (!row || row.attempts >= CODE_MAX_ATTEMPTS) return null;

      const expected = Buffer.from(row.codeHash, "hex");
      const actual = Buffer.from(hashCode(purpose, destination, code), "hex");
      if (expected.length === actual.length && timingSafeEqual(expected, actual)) return row.id;

      await tx
        .update(otpCodes)
        .set({ attempts: row.attempts + 1 })
        .where(eq(otpCodes.id, row.id));
      return null;
    });
    if (!outcome) {
      throw new AuthError("invalid_code", "That code is wrong or has expired. Request a new one.");
    }
    return outcome;
  }

  /** Marks a checked code used, inside the caller's transaction. False if someone else used it first. */
  async function consumeCode(tx: DbOrTx, codeId: string): Promise<boolean> {
    const used = await tx
      .update(otpCodes)
      .set({ consumedAt: sql`now()` })
      .where(and(eq(otpCodes.id, codeId), isNull(otpCodes.consumedAt)))
      .returning({ id: otpCodes.id });
    return used.length === 1;
  }

  async function createSession(tx: DbOrTx, userId: string) {
    const token = randomBytes(32).toString("base64url");
    const [row] = await tx
      .insert(sessions)
      .values({
        userId,
        tokenHash: hashToken(token),
        expiresAt: sql`now() + make_interval(days => ${SESSION_DAYS})`,
      })
      .returning();
    return { token, expiresAt: row!.expiresAt };
  }

  async function getUser(userId: string): Promise<User> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new AuthError("user_not_found", "Account not found");
    return user;
  }

  /** The destination a PIN-reset code goes to: the phone, else the email. */
  function resetDestination(user: User) {
    if (user.phone) return { channel: "sms" as const, destination: user.phone };
    if (user.email) return { channel: "email" as const, destination: user.email };
    throw new AuthError("user_not_found", "This account has no phone number or email");
  }

  /**
   * Checks the PIN before a purchase. Throws pin_not_set, pin_locked, or wrong_pin (with the
   * tries left). Wrong tries are saved under a row lock before the error is thrown.
   */
  async function verifyPin(userId: string, pin: string): Promise<void> {
    const failure = await db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
      if (!user) return new AuthError("user_not_found", "Account not found");
      if (!user.pinHash) return new AuthError("pin_not_set", "Set a transaction PIN first");
      if (user.pinLockedAt) {
        return new AuthError(
          "pin_locked",
          "Your PIN is locked after too many wrong tries. Reset it with a code sent to your phone.",
        );
      }
      if (/^\d{4}$/.test(pin) && (await pinMatches(pin, user.pinHash))) {
        if (user.pinFailedAttempts > 0) {
          await tx.update(users).set({ pinFailedAttempts: 0 }).where(eq(users.id, userId));
        }
        return null;
      }
      const attempts = user.pinFailedAttempts + 1;
      const locked = attempts >= PIN_MAX_ATTEMPTS;
      await tx
        .update(users)
        .set({ pinFailedAttempts: attempts, ...(locked ? { pinLockedAt: sql`now()` } : {}) })
        .where(eq(users.id, userId));
      return locked
        ? new AuthError(
            "pin_locked",
            "Wrong PIN. Your PIN is now locked; reset it with a code sent to your phone.",
          )
        : new AuthError("wrong_pin", `Wrong PIN. ${PIN_MAX_ATTEMPTS - attempts} tries left.`, {
            attemptsRemaining: PIN_MAX_ATTEMPTS - attempts,
          });
    });
    if (failure) throw failure;
  }

  return {
    /** Sends a sign-in code to a phone number or email. Doesn't reveal whether an account exists. */
    async requestOtp(input: { destination: string; purpose: "sign_in" }) {
      const { channel, destination } = normaliseDestination(input.destination);
      return sendCode(destination, channel, input.purpose);
    },

    /**
     * Signs in with a code. A new customer must also give fullName (and an email when signing up
     * by phone, which wallet funding needs): without them the answer is "profile_required" and
     * the code stays usable so the app can ask and resubmit.
     */
    async signIn(input: {
      destination: string;
      code: string;
      fullName?: string;
      email?: string;
      phone?: string;
    }): Promise<SignInResult> {
      const { channel, destination } = normaliseDestination(input.destination);
      const codeId = await checkCode(destination, "sign_in", input.code.trim());

      const byDestination =
        channel === "sms" ? eq(users.phone, destination) : eq(users.email, destination);
      const [existing] = await db.select().from(users).where(byDestination);
      if (existing && existing.status !== "active") {
        throw new AuthError(
          "account_suspended",
          "This account is suspended. Please contact support.",
        );
      }

      let profile: { fullName: string; email: string | null; phone: string | null } | null = null;
      if (!existing) {
        const fullName = input.fullName?.trim() ?? "";
        const email = channel === "email" ? destination : (input.email?.trim().toLowerCase() ?? "");
        const phone =
          channel === "sms"
            ? destination
            : input.phone
              ? normaliseNigerianPhone(input.phone)
              : null;
        if (!fullName && !input.email && !input.phone) return { status: "profile_required" };
        if (fullName.length < 2 || fullName.length > 100) {
          throw new AuthError("profile_invalid", "Enter your full name");
        }
        if (!EMAIL.test(email))
          throw new AuthError("profile_invalid", "Enter a valid email address");
        if (input.phone && !phone) {
          throw new AuthError("profile_invalid", "Enter a valid Nigerian phone number");
        }
        profile = { fullName, email, phone };
      }

      return db.transaction(async (tx) => {
        if (!(await consumeCode(tx, codeId))) {
          throw new AuthError(
            "invalid_code",
            "That code has already been used. Request a new one.",
          );
        }
        let user = existing;
        if (!user && profile) {
          const [emailOwner] = profile.email
            ? await tx.select({ id: users.id }).from(users).where(eq(users.email, profile.email))
            : [];
          if (emailOwner) {
            throw new AuthError("email_taken", "That email is already used by another account");
          }
          const [phoneOwner] = profile.phone
            ? await tx.select({ id: users.id }).from(users).where(eq(users.phone, profile.phone))
            : [];
          if (phoneOwner) {
            throw new AuthError(
              "phone_taken",
              "That phone number is already used by another account",
            );
          }
          [user] = await tx
            .insert(users)
            .values({
              fullName: profile.fullName,
              email: profile.email,
              phone: profile.phone,
              ...(channel === "sms"
                ? { phoneVerifiedAt: sql`now()` }
                : { emailVerifiedAt: sql`now()` }),
            })
            .returning();
          await tx.insert(wallets).values({ userId: user!.id });
        } else if (user) {
          [user] = await tx
            .update(users)
            .set(
              channel === "sms" ? { phoneVerifiedAt: sql`now()` } : { emailVerifiedAt: sql`now()` },
            )
            .where(eq(users.id, user.id))
            .returning();
        }
        const session = await createSession(tx, user!.id);
        return { status: "signed_in" as const, user: user!, ...session };
      });
    },

    /** The signed-in user for a session token, or null (unknown, expired, signed out, suspended). */
    async getSessionUser(token: string): Promise<User | null> {
      if (!token) return null;
      const [row] = await db
        .select({ user: users })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
          and(
            eq(sessions.tokenHash, hashToken(token)),
            gt(sessions.expiresAt, sql`now()`),
            eq(users.status, "active"),
          ),
        );
      return row?.user ?? null;
    },

    async signOut(token: string): Promise<void> {
      await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    },

    /** Sets the PIN. Changing an existing PIN needs the current one. */
    async setPin(userId: string, input: { pin: string; currentPin?: string }): Promise<void> {
      checkPinFormat(input.pin);
      const user = await getUser(userId);
      if (user.pinHash) {
        if (!input.currentPin) {
          throw new AuthError("current_pin_required", "Enter your current PIN to change it");
        }
        await verifyPin(userId, input.currentPin);
      }
      await db
        .update(users)
        .set({
          pinHash: await hashPin(input.pin),
          pinFailedAttempts: 0,
          pinLockedAt: null,
          updatedAt: sql`now()`,
        })
        .where(eq(users.id, userId));
    },

    verifyPin,

    /** Sends a PIN-reset code to the signed-in customer's phone (or email if no phone). */
    async requestPinResetOtp(userId: string) {
      const { channel, destination } = resetDestination(await getUser(userId));
      return sendCode(destination, channel, "pin_reset");
    },

    /** Resets (and unlocks) the PIN with a PIN-reset code. */
    async resetPin(userId: string, input: { code: string; pin: string }): Promise<void> {
      checkPinFormat(input.pin);
      const { destination } = resetDestination(await getUser(userId));
      const codeId = await checkCode(destination, "pin_reset", input.code.trim());
      const pinHash = await hashPin(input.pin);
      await db.transaction(async (tx) => {
        if (!(await consumeCode(tx, codeId))) {
          throw new AuthError(
            "invalid_code",
            "That code has already been used. Request a new one.",
          );
        }
        await tx
          .update(users)
          .set({ pinHash, pinFailedAttempts: 0, pinLockedAt: null, updatedAt: sql`now()` })
          .where(eq(users.id, userId));
      });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
