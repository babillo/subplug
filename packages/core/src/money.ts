// All money is stored and calculated as integer kobo (₦1 = 100 kobo). No floats, ever.

export type Kobo = number;

/** Throws if the value is not a safe whole number of kobo. */
export function assertKobo(value: number): asserts value is Kobo {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Expected an integer amount in kobo, got ${value}`);
  }
}

/** Converts whole naira to kobo. Only accepts whole naira to avoid float rounding errors. */
export function nairaToKobo(naira: number): Kobo {
  if (!Number.isSafeInteger(naira)) {
    throw new TypeError(`nairaToKobo only accepts whole naira, got ${naira}`);
  }
  return naira * 100;
}

/** Formats kobo for display, e.g. 150050 -> "₦1,500.50". Shared with the web and mobile apps. */
export { formatNaira } from "@repo/shared/money";

const DECIMAL_PATTERN = /^(-?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/;

/**
 * Converts a provider's naira decimal (e.g. "100.00", "1,500.50", or a JSON number like a balance)
 * to integer kobo by reading the digits as text, never by multiplying a float.
 * Rounds half-up (away from zero) at the third decimal place.
 */
export function decimalToKobo(value: string | number): Kobo {
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Not a finite amount: ${value}`);
    text = String(value);
  } else {
    text = value.trim();
  }

  const match = DECIMAL_PATTERN.exec(text);
  if (!match) throw new TypeError(`Not a plain decimal amount: "${text}"`);
  const [, sign = "", wholePart = "", fraction = ""] = match;

  const digits = fraction.padEnd(3, "0");
  let kobo = BigInt(wholePart.replaceAll(",", "")) * 100n + BigInt(digits.slice(0, 2));
  if (Number(digits[2]) >= 5) kobo += 1n;
  if (sign === "-") kobo = -kobo;

  const result = Number(kobo);
  if (!Number.isSafeInteger(result)) throw new TypeError(`Amount too large: "${text}"`);
  return result === 0 ? 0 : result; // avoid -0
}

/** Converts kobo to whole naira for providers that take naira. Refuses leftover kobo. */
export function koboToWholeNaira(kobo: Kobo): number {
  assertKobo(kobo);
  if (kobo % 100 !== 0) {
    throw new RangeError(`${kobo} kobo is not a whole naira amount`);
  }
  return kobo / 100;
}
