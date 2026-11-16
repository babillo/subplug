// A harmless "fingerprint" of the Monnify settings, to compare two places (the laptop and the
// staging site) without ever showing a key. For each value: its length, the kind of key it
// looks like (MK_TEST_ / MK_PROD_ prefix only), and whether it holds characters that don't
// belong in a key (spaces, quotes, invisible or non-English characters). Plus a short code made
// from SHA-256 of "apiKey:secretKey": identical settings give the same code, any difference
// gives a different one, and the code can't be turned back into the keys.
import { createHash } from "node:crypto";

export interface ValueFacts {
  length: number;
  /** "MK_TEST_", "MK_PROD_" or "other". Only this well-known prefix is ever shown. */
  kind: string;
  /** Problems found, in plain words; empty when the value looks clean. */
  oddities: string[];
}

export interface MonnifyFingerprint {
  apiKey: ValueFacts;
  secretKey: ValueFacts;
  contractCode: ValueFacts;
  /** First 8 hex characters of SHA-256("apiKey:secretKey") as sent to Monnify (trimmed). */
  pairCode: string;
}

function describe(raw: string | undefined): ValueFacts {
  const value = raw ?? "";
  const trimmed = value.trim();
  const oddities: string[] = [];
  if (value === "") oddities.push("empty");
  if (trimmed !== value) oddities.push("spaces or line breaks at the ends (removed before use)");
  if (/\s/.test(trimmed)) oddities.push("spaces or line breaks inside");
  if (/["'`]/.test(trimmed)) oddities.push("quote marks");
  if (/[^\x21-\x7e]/.test(trimmed)) oddities.push("invisible or non-English characters");
  const prefix = /^MK_(TEST|PROD)_/.exec(trimmed);
  return { length: trimmed.length, kind: prefix ? prefix[0] : "other", oddities };
}

export function monnifyFingerprint(
  env: Record<string, string | undefined> = process.env,
): MonnifyFingerprint {
  const apiKey = env.MONNIFY_API_KEY?.trim() ?? "";
  const secretKey = env.MONNIFY_SECRET_KEY?.trim() ?? "";
  return {
    apiKey: describe(env.MONNIFY_API_KEY),
    secretKey: describe(env.MONNIFY_SECRET_KEY),
    contractCode: describe(env.MONNIFY_CONTRACT_CODE),
    pairCode: createHash("sha256").update(`${apiKey}:${secretKey}`).digest("hex").slice(0, 8),
  };
}

/** One line per value, for the laptop command and the System page. */
export function formatFingerprint(f: MonnifyFingerprint): string[] {
  const line = (name: string, v: ValueFacts) =>
    `${name}: ${v.length} characters, ${v.kind === "other" ? "no MK_ prefix" : `starts ${v.kind}`}` +
    (v.oddities.length ? ` — ${v.oddities.join(", ")}` : ", looks clean");
  return [
    line("MONNIFY_API_KEY", f.apiKey),
    line("MONNIFY_SECRET_KEY", f.secretKey),
    line("MONNIFY_CONTRACT_CODE", f.contractCode),
    `Key + secret code: ${f.pairCode}`,
  ];
}
