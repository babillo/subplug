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

/** Picks the sender from OTP_SENDER (default "console"). The console sender never runs in production. */
export function createOtpSenderFromEnv(
  env: Record<string, string | undefined> = process.env,
): OtpSender {
  const kind = env.OTP_SENDER?.trim() || "console";
  if (kind === "console") {
    if (env.NODE_ENV === "production") {
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
