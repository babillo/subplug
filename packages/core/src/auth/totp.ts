// Authenticator-app codes for admin two-step sign-in (TOTP, RFC 6238): the standard used by
// Google Authenticator, Microsoft Authenticator, Authy and others. A shared secret plus the
// current 30-second time step gives a 6-digit code. Written here (about 40 lines of maths)
// instead of adding a library; checked against the RFC's published test values.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

/** Bytes → base32 (no padding), the format authenticator apps expect. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Base32 → bytes. Accepts lower case, spaces and "=" padding (as people type it). */
export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Not a base32 key");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** A new random secret: 20 bytes (160 bits), base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The 6-digit code for a 30-second time step (step = seconds since 1970 ÷ 30). */
export function totpAt(secretBase32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Checks a typed code against the previous, current and next 30-second steps (phone clocks drift).
 * Returns the matching step, or null. `lastUsedStep`: codes from that step or earlier are refused,
 * so a code seen over someone's shoulder can't be used again.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  now: Date = new Date(),
  lastUsedStep: number | null = null,
): number | null {
  const typed = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(typed)) return null;
  const current = Math.floor(now.getTime() / 1000 / STEP_SECONDS);
  for (const step of [current - 1, current, current + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = Buffer.from(totpAt(secretBase32, step));
    if (timingSafeEqual(expected, Buffer.from(typed))) return step;
  }
  return null;
}

/** The link inside the QR code that authenticator apps scan. */
export function otpauthUri(secretBase32: string, accountName: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = `secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
  return `otpauth://totp/${label}?${params}`;
}

// --- Encryption of stored secrets -----------------------------------------------------------
// AES-256-GCM with a key derived from AUTH_SECRET. GCM also detects tampering. Format:
// "v1:" + base64(12-byte nonce | ciphertext | 16-byte tag).

function keyFrom(authSecret: string): Buffer {
  return createHash("sha256").update(`subplug:totp-secret:${authSecret}`).digest();
}

export function encryptSecret(plain: string, authSecret: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(authSecret), nonce);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([nonce, body, cipher.getAuthTag()]).toString("base64")}`;
}

export function decryptSecret(stored: string, authSecret: string): string {
  if (!stored.startsWith("v1:")) throw new Error("Unknown secret format");
  const raw = Buffer.from(stored.slice(3), "base64");
  const nonce = raw.subarray(0, 12);
  const tag = raw.subarray(raw.length - 16);
  const body = raw.subarray(12, raw.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(authSecret), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
