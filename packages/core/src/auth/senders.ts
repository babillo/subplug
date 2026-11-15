// Code senders. Development: ConsoleOtpSender prints codes in the server terminal. A real SMS/email
// provider (e.g. Termii, Resend) is added later as another OtpSender + one case below.
import type { OtpMessage, OtpSender } from "./types.ts";

export class ConsoleOtpSender implements OtpSender {
  async send(message: OtpMessage): Promise<void> {
    console.info(
      `[dev code] ${message.purpose === "pin_reset" ? "PIN reset" : "Sign-in"} code for ` +
        `${message.destination} (${message.channel}): ${message.code}`,
    );
  }
}

/** Which deployment this is: the laptop, the private staging site, or the live site. */
export type AppEnv = "development" | "staging" | "production";

/**
 * APP_ENV, if set (development | staging | production). Without it, a production build counts as
 * production, so forgetting the setting can never make the live site less strict.
 */
export function getAppEnv(env: Record<string, string | undefined> = process.env): AppEnv {
  const value = env.APP_ENV?.trim();
  if (!value) return env.NODE_ENV === "production" ? "production" : "development";
  if (value === "development" || value === "staging" || value === "production") return value;
  throw new Error(`Unknown APP_ENV "${value}". Use development, staging or production.`);
}

/**
 * Picks the sender from OTP_SENDER (default "console"). The console sender prints codes to the
 * log: fine on the laptop and the private staging site, never on the live site.
 */
export function createOtpSenderFromEnv(
  env: Record<string, string | undefined> = process.env,
): OtpSender {
  const kind = env.OTP_SENDER?.trim() || "console";
  if (kind === "console") {
    if (getAppEnv(env) === "production") {
      throw new Error(
        "OTP_SENDER=console prints codes to the log; it can't be used in production.",
      );
    }
    return new ConsoleOtpSender();
  }
  throw new Error(`Unknown OTP_SENDER "${kind}". Only "console" exists so far.`);
}

/** AUTH_SECRET keys the one-time code hashes. Must be long and random; never commit it. */
export function getAuthSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.AUTH_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or shorter than 32 characters. Generate one with " +
        "`openssl rand -hex 32` and put it in .env.local (laptop) or the environment's settings.",
    );
  }
  return secret;
}
