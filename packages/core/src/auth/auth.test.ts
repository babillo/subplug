// Sign-in (one-time codes), sessions and the transaction PIN. Real PostgreSQL (TEST_DATABASE_URL).
import { type Database, schema } from "@repo/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FakeOtpSender } from "../test/fake-otp-sender.ts";
import { hasTestDatabase, openTestDb, resetDatabase } from "../test/db.ts";
import { AuthError, createAuthService } from "./auth.ts";
import { checkPinFormat, hashPin, PIN_MAX_ATTEMPTS } from "./pin.ts";

const SECRET = "test-auth-secret-0123456789abcdef";

// Pure checks: no database needed.
describe("PIN format", () => {
  it.each(["1357", "2468", "9051"])("accepts %s", (pin) => {
    expect(() => checkPinFormat(pin)).not.toThrow();
  });

  it.each(["", "123", "12345", "12a4", " 1357"])("rejects %j as not 4 digits", (pin) => {
    expect(() => checkPinFormat(pin)).toThrow(
      expect.objectContaining({ code: "invalid_pin_format" }),
    );
  });

  it.each(["0000", "1111", "1234", "4321", "9876"])("rejects the easy-to-guess %s", (pin) => {
    expect(() => checkPinFormat(pin)).toThrow(expect.objectContaining({ code: "weak_pin" }));
  });

  it("stores a bcrypt hash, never the PIN itself", async () => {
    const hash = await hashPin("1357");
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash).not.toContain("1357");
  });
});

describe.skipIf(!hasTestDatabase)("auth (real PostgreSQL)", { timeout: 120_000 }, () => {
  let db: Database;
  let close: () => Promise<void>;
  let sender: FakeOtpSender;
  let auth: ReturnType<typeof createAuthService>;

  beforeAll(() => {
    ({ db, close } = openTestDb());
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await resetDatabase(db);
    sender = new FakeOtpSender();
    auth = createAuthService({ db, sender, secret: SECRET });
  });

  const PHONE = "08031234567";

  async function signUp(phone = PHONE, email = `${crypto.randomUUID()}@example.test`) {
    await auth.requestOtp({ destination: phone, purpose: "sign_in" });
    const result = await auth.signIn({
      destination: phone,
      code: sender.lastCode(phone),
      fullName: "Ada Obi",
      email,
    });
    if (result.status !== "signed_in") throw new Error("expected sign-in");
    return result;
  }

  /** Lets a new code be requested immediately (skips the 1-minute resend wait). */
  async function allowResend(destination: string) {
    await db.execute(
      sql`update otp_codes set created_at = now() - interval '2 minutes' where destination = ${destination}`,
    );
  }

  async function errorOf(promise: Promise<unknown>): Promise<AuthError> {
    const error = await promise.then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AuthError);
    return error as AuthError;
  }

  describe("one-time codes", () => {
    it("sends a 6-digit code and stores only a hash of it", async () => {
      const result = await auth.requestOtp({
        destination: "+234 803 123 4567",
        purpose: "sign_in",
      });

      expect(result).toMatchObject({ channel: "sms", destination: PHONE });
      const code = sender.lastCode(PHONE);
      expect(code).toMatch(/^\d{6}$/);
      const [row] = await db.select().from(schema.otpCodes);
      expect(row).toMatchObject({ destination: PHONE, channel: "sms", purpose: "sign_in" });
      expect(JSON.stringify(row)).not.toContain(code);
    });

    it("sends email codes to a lower-cased address", async () => {
      const result = await auth.requestOtp({
        destination: " Ada@Example.TEST ",
        purpose: "sign_in",
      });
      expect(result).toMatchObject({ channel: "email", destination: "ada@example.test" });
    });

    it("refuses something that is neither a Nigerian phone number nor an email", async () => {
      const error = await errorOf(auth.requestOtp({ destination: "12345", purpose: "sign_in" }));
      expect(error.code).toBe("invalid_destination");
      expect(sender.sent).toHaveLength(0);
    });

    it("allows one code per minute per destination", async () => {
      await auth.requestOtp({ destination: PHONE, purpose: "sign_in" });
      const error = await errorOf(auth.requestOtp({ destination: PHONE, purpose: "sign_in" }));
      expect(error.code).toBe("rate_limited");
      expect(error.retryAfterSeconds).toBeGreaterThan(0);
      expect(error.retryAfterSeconds).toBeLessThanOrEqual(60);
      expect(sender.sent).toHaveLength(1);
    });

    it("allows at most 5 codes per hour per destination", async () => {
      for (let i = 0; i < 5; i++) {
        await auth.requestOtp({ destination: PHONE, purpose: "sign_in" });
        await allowResend(PHONE);
      }
      const error = await errorOf(auth.requestOtp({ destination: PHONE, purpose: "sign_in" }));
      expect(error.code).toBe("rate_limited");
    });

    it("rejects a wrong code, and kills the code after 5 wrong tries", async () => {
      await auth.requestOtp({ destination: PHONE, purpose: "sign_in" });
      const code = sender.lastCode(PHONE);
      const wrong = code === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++) {
        expect((await errorOf(auth.signIn({ destination: PHONE, code: wrong }))).code).toBe(
          "invalid_code",
        );
      }
      // Even the right code no longer works.
      const error = await errorOf(
        auth.signIn({ destination: PHONE, code, fullName: "Ada", email: "a@example.test" }),
      );
      expect(error.code).toBe("invalid_code");
    });

    it("rejects an expired code", async () => {
      await auth.requestOtp({ destination: PHONE, purpose: "sign_in" });
      await db.execute(sql`update otp_codes set expires_at = now() - interval '1 second'`);
      const error = await errorOf(
        auth.signIn({
          destination: PHONE,
          code: sender.lastCode(PHONE),
          fullName: "Ada",
          email: "a@example.test",
        }),
      );
      expect(error.code).toBe("invalid_code");
    });

    it("a code works once only", async () => {
      await signUp();
      const error = await errorOf(
        auth.signIn({ destination: PHONE, code: sender.lastCode(PHONE) }),
      );
      expect(error.code).toBe("invalid_code");
    });

    it("a sign-in code can't reset the PIN, and only the newest code works", async () => {
      const { token } = await signUp();
      const user = await auth.getSessionUser(token);
      await auth.setPin(user!.id, { pin: "1357" });

      await allowResend(PHONE);
      await auth.requestOtp({ destination: PHONE, purpose: "sign_in" });
      const signInCode = sender.lastCode(PHONE);
      const error = await errorOf(auth.resetPin(user!.id, { code: signInCode, pin: "2468" }));
      expect(error.code).toBe("invalid_code");

      await allowResend(PHONE);
      await auth.requestOtp({ destination: PHONE, purpose: "sign_in" });
      expect((await errorOf(auth.signIn({ destination: PHONE, code: signInCode }))).code).toBe(
        "invalid_code",
      );
    });
  });

  describe("signing up and signing in", () => {
    it("a new customer gives name and email once the code is right; the code stays usable for that", async () => {
      await auth.requestOtp({ destination: PHONE, purpose: "sign_in" });
      const code = sender.lastCode(PHONE);

      expect(await auth.signIn({ destination: PHONE, code })).toEqual({
        status: "profile_required",
      });

      const result = await auth.signIn({
        destination: PHONE,
        code,
        fullName: "Ada Obi",
        email: "Ada@Example.test",
      });
      expect(result.status).toBe("signed_in");
      const [user] = await db.select().from(schema.users);
      expect(user).toMatchObject({ fullName: "Ada Obi", phone: PHONE, email: "ada@example.test" });
      expect(user!.phoneVerifiedAt).not.toBeNull();
      expect(await db.select().from(schema.wallets)).toHaveLength(1);
    });

    it("an existing customer signs in with just the code", async () => {
      await signUp();
      await allowResend(PHONE);
      await auth.requestOtp({ destination: PHONE, purpose: "sign_in" });
      const result = await auth.signIn({ destination: PHONE, code: sender.lastCode(PHONE) });
      expect(result.status).toBe("signed_in");
      expect(await db.select().from(schema.users)).toHaveLength(1);
    });

    it("refuses an email that already belongs to another account", async () => {
      await signUp(PHONE, "taken@example.test");
      const other = "08039999999";
      await auth.requestOtp({ destination: other, purpose: "sign_in" });
      const error = await errorOf(
        auth.signIn({
          destination: other,
          code: sender.lastCode(other),
          fullName: "Someone",
          email: "TAKEN@example.test",
        }),
      );
      expect(error.code).toBe("email_taken");
    });

    it("refuses a suspended account", async () => {
      await signUp();
      await db.update(schema.users).set({ status: "suspended" });
      await allowResend(PHONE);
      await auth.requestOtp({ destination: PHONE, purpose: "sign_in" });
      const error = await errorOf(
        auth.signIn({ destination: PHONE, code: sender.lastCode(PHONE) }),
      );
      expect(error.code).toBe("account_suspended");
    });
  });

  describe("sessions", () => {
    it("a session token finds its user; only a hash of the token is stored", async () => {
      const { token, user } = await signUp();
      expect(token.length).toBeGreaterThanOrEqual(40);
      expect((await auth.getSessionUser(token))?.id).toBe(user.id);
      const [row] = await db.select().from(schema.sessions);
      expect(row!.tokenHash).not.toBe(token);
      expect(JSON.stringify(row)).not.toContain(token);
    });

    it("rejects unknown, expired and signed-out tokens", async () => {
      const { token } = await signUp();
      expect(await auth.getSessionUser("not-a-real-token")).toBeNull();

      await auth.signOut(token);
      expect(await auth.getSessionUser(token)).toBeNull();

      await allowResend(PHONE);
      await auth.requestOtp({ destination: PHONE, purpose: "sign_in" });
      const again = await auth.signIn({ destination: PHONE, code: sender.lastCode(PHONE) });
      if (again.status !== "signed_in") throw new Error("expected sign-in");
      await db.execute(sql`update sessions set expires_at = now() - interval '1 second'`);
      expect(await auth.getSessionUser(again.token)).toBeNull();
    });

    it("a suspended customer's sessions stop working", async () => {
      const { token } = await signUp();
      await db.update(schema.users).set({ status: "suspended" });
      expect(await auth.getSessionUser(token)).toBeNull();
    });
  });

  describe("transaction PIN", () => {
    async function userWithPin(pin = "1357") {
      const { user } = await signUp();
      await auth.setPin(user.id, { pin });
      return user;
    }

    it("sets a PIN and accepts it", async () => {
      const user = await userWithPin();
      await expect(auth.verifyPin(user.id, "1357")).resolves.toBeUndefined();
      const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
      expect(row!.pinHash).toMatch(/^\$2[aby]\$/);
    });

    it("refuses purchases-style checks before a PIN is set", async () => {
      const { user } = await signUp();
      expect((await errorOf(auth.verifyPin(user.id, "1357"))).code).toBe("pin_not_set");
    });

    it("counts wrong PINs and locks after 5; the count survives (it's in the database)", async () => {
      const user = await userWithPin();
      for (let i = 1; i < PIN_MAX_ATTEMPTS; i++) {
        const error = await errorOf(auth.verifyPin(user.id, "2468"));
        expect(error.code).toBe("wrong_pin");
        expect(error.attemptsRemaining).toBe(PIN_MAX_ATTEMPTS - i);
      }
      // A fresh service (as after a restart) sees the same count.
      const restarted = createAuthService({ db, sender, secret: SECRET });
      expect((await errorOf(restarted.verifyPin(user.id, "2468"))).code).toBe("pin_locked");

      // Locked: even the right PIN is refused.
      expect((await errorOf(auth.verifyPin(user.id, "1357"))).code).toBe("pin_locked");
    });

    it("a correct PIN resets the wrong-try count", async () => {
      const user = await userWithPin();
      for (let i = 0; i < 4; i++) await errorOf(auth.verifyPin(user.id, "2468"));
      await auth.verifyPin(user.id, "1357");
      const error = await errorOf(auth.verifyPin(user.id, "2468"));
      expect(error.attemptsRemaining).toBe(PIN_MAX_ATTEMPTS - 1);
    });

    it("wrong PINs fired at the same moment are all counted (no lost updates)", async () => {
      const user = await userWithPin();
      await Promise.allSettled(Array.from({ length: 5 }, () => auth.verifyPin(user.id, "2468")));
      expect((await errorOf(auth.verifyPin(user.id, "1357"))).code).toBe("pin_locked");
    });

    it("changing the PIN needs the current one", async () => {
      const user = await userWithPin();
      expect((await errorOf(auth.setPin(user.id, { pin: "2468" }))).code).toBe(
        "current_pin_required",
      );
      expect((await errorOf(auth.setPin(user.id, { pin: "2468", currentPin: "9051" }))).code).toBe(
        "wrong_pin",
      );
      await auth.setPin(user.id, { pin: "2468", currentPin: "1357" });
      await expect(auth.verifyPin(user.id, "2468")).resolves.toBeUndefined();
    });

    it("a locked PIN is reset with a one-time code sent to the customer's phone", async () => {
      const user = await userWithPin();
      for (let i = 0; i < PIN_MAX_ATTEMPTS; i++) await errorOf(auth.verifyPin(user.id, "2468"));

      await auth.requestPinResetOtp(user.id);
      const code = sender.lastCode(PHONE);
      expect(sender.sent.at(-1)).toMatchObject({ purpose: "pin_reset", destination: PHONE });

      await auth.resetPin(user.id, { code, pin: "9051" });
      await expect(auth.verifyPin(user.id, "9051")).resolves.toBeUndefined();
      expect((await errorOf(auth.verifyPin(user.id, "1357"))).code).toBe("wrong_pin");
    });

    it("refuses weak PINs when setting one", async () => {
      const { user } = await signUp();
      expect((await errorOf(auth.setPin(user.id, { pin: "1234" }))).code).toBe("weak_pin");
    });
  });
});
