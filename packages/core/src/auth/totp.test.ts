// Authenticator-app codes (TOTP, RFC 6238) and the encryption of their secrets.
import { describe, expect, it } from "vitest";

import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  otpauthUri,
  totpAt,
  verifyTotp,
} from "./totp.ts";

// RFC 6238 appendix B: SHA-1 secret is the ASCII bytes "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("base32 (RFC 4648 test vectors)", () => {
  it.each([
    ["", ""],
    ["f", "MY"],
    ["fo", "MZXQ"],
    ["foo", "MZXW6"],
    ["foob", "MZXW6YQ"],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI"],
  ])("%j ↔ %s", (text, encoded) => {
    expect(base32Encode(Buffer.from(text))).toBe(encoded);
    expect(Buffer.from(base32Decode(encoded)).toString()).toBe(text);
  });

  it("decodes what people type: lower case, spaces, padding", () => {
    expect(Buffer.from(base32Decode("mzxw 6ytb oi==")).toString()).toBe("foobar");
  });

  it("refuses characters that aren't base32", () => {
    expect(() => base32Decode("MZXW1")).toThrow();
  });
});

describe("totpAt (RFC 6238 test vectors, last 6 digits)", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ])("at %s seconds → %s", (seconds, code) => {
    expect(totpAt(RFC_SECRET, Math.floor(seconds / 30))).toBe(code);
  });
});

describe("verifyTotp", () => {
  const now = new Date(1234567890 * 1000); // step 41152263, code 005924
  const step = Math.floor(1234567890 / 30);

  it("accepts the current code and returns its step", () => {
    expect(verifyTotp(RFC_SECRET, "005924", now)).toBe(step);
  });

  it("accepts the code from 30 seconds before or after (phone clocks drift)", () => {
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 1), now)).toBe(step + 1);
  });

  it("refuses older codes, wrong codes and junk", () => {
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 2), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "000000", now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", now)).toBeNull();
  });

  it("refuses a code from a step already used (no replay)", () => {
    expect(verifyTotp(RFC_SECRET, "005924", now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 1), now, step)).toBe(step + 1);
  });

  it("ignores spaces people type, e.g. 005 924", () => {
    expect(verifyTotp(RFC_SECRET, "005 924", now)).toBe(step);
  });
});

describe("generateTotpSecret / otpauthUri", () => {
  it("makes a 160-bit secret, different every time", () => {
    const a = generateTotpSecret();
    expect(base32Decode(a)).toHaveLength(20);
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toBe(a);
  });

  it("builds the link authenticator apps scan", () => {
    expect(otpauthUri("JBSWY3DPEHPK3PXP", "Ada Obi", "Sauritop")).toBe(
      "otpauth://totp/Sauritop:Ada%20Obi?secret=JBSWY3DPEHPK3PXP&issuer=Sauritop&algorithm=SHA1&digits=6&period=30",
    );
  });
});

describe("encryptSecret / decryptSecret", () => {
  const key = "k".repeat(40);

  it("round-trips, and the stored form doesn't contain the secret", () => {
    const stored = encryptSecret("JBSWY3DPEHPK3PXP", key);
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(stored, key)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("encrypts the same secret differently each time", () => {
    expect(encryptSecret("JBSWY3DPEHPK3PXP", key)).not.toBe(encryptSecret("JBSWY3DPEHPK3PXP", key));
  });

  it("refuses a tampered value or the wrong key", () => {
    const stored = encryptSecret("JBSWY3DPEHPK3PXP", key);
    const tampered = stored.slice(0, -2) + (stored.endsWith("A") ? "BB" : "AA");
    expect(() => decryptSecret(tampered, key)).toThrow();
    expect(() => decryptSecret(stored, "x".repeat(40))).toThrow();
  });
});
