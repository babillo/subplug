import { describe, expect, it } from "vitest";

import { formatFingerprint, monnifyFingerprint } from "./fingerprint.ts";

const env = {
  MONNIFY_API_KEY: "MK_TEST_ABC123",
  MONNIFY_SECRET_KEY: "SECRET999",
  MONNIFY_CONTRACT_CODE: "1234567890",
};

describe("monnifyFingerprint", () => {
  it("never contains the keys themselves", () => {
    const text =
      JSON.stringify(monnifyFingerprint(env)) +
      formatFingerprint(monnifyFingerprint(env)).join("\n");
    expect(text).not.toContain("ABC123");
    expect(text).not.toContain("SECRET999");
    expect(text).not.toContain("1234567890");
  });

  it("describes clean values", () => {
    const f = monnifyFingerprint(env);
    expect(f.apiKey).toEqual({ length: 14, kind: "MK_TEST_", oddities: [] });
    expect(f.secretKey.kind).toBe("other");
    expect(f.pairCode).toMatch(/^[0-9a-f]{8}$/);
  });

  it("gives the same code for the same keys, even with spaces at the ends", () => {
    const padded = { ...env, MONNIFY_SECRET_KEY: " SECRET999\n" };
    expect(monnifyFingerprint(padded).pairCode).toBe(monnifyFingerprint(env).pairCode);
    expect(monnifyFingerprint(padded).secretKey.oddities).toEqual([
      "spaces or line breaks at the ends (removed before use)",
    ]);
  });

  it("gives a different code when one character differs", () => {
    const other = { ...env, MONNIFY_SECRET_KEY: "SECRET998" };
    expect(monnifyFingerprint(other).pairCode).not.toBe(monnifyFingerprint(env).pairCode);
  });

  it("flags hidden characters, quotes, inner spaces and empty values", () => {
    const f = monnifyFingerprint({
      MONNIFY_API_KEY: '"MK_TEST_ABC"',
      MONNIFY_SECRET_KEY: "SEC\u200bRET",
      MONNIFY_CONTRACT_CODE: "",
    });
    expect(f.apiKey.oddities).toContain("quote marks");
    expect(f.secretKey.oddities).toContain("invisible or non-English characters");
    expect(f.contractCode.oddities).toContain("empty");
    expect(
      monnifyFingerprint({ ...env, MONNIFY_API_KEY: "MK_TEST_ AB" }).apiKey.oddities,
    ).toContain("spaces or line breaks inside");
  });
});
