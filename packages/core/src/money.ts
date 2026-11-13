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

/** Formats kobo for display, e.g. 150050 -> "₦1,500.50". Display only; never parse this back. */
export function formatNaira(kobo: Kobo): string {
  assertKobo(kobo);
  const sign = kobo < 0 ? "-" : "";
  const abs = Math.abs(kobo);
  const naira = Math.floor(abs / 100);
  const remainder = String(abs % 100).padStart(2, "0");
  return `${sign}₦${naira.toLocaleString("en-NG")}.${remainder}`;
}
