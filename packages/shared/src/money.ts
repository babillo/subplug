// Money display helpers safe for the browser and the server. Money is always integer kobo.

/** 150050 → "₦1,500.50". With compact, whole-naira amounts drop ".00" (₦350). Display only. */
export function formatNaira(kobo: number, options: { compact?: boolean } = {}): string {
  if (!Number.isSafeInteger(kobo)) throw new TypeError(`Expected integer kobo, got ${kobo}`);
  const sign = kobo < 0 ? "-" : "";
  const abs = Math.abs(kobo);
  const naira = Math.floor(abs / 100).toLocaleString("en-NG");
  const rest = abs % 100;
  if (options.compact && rest === 0) return `${sign}₦${naira}`;
  return `${sign}₦${naira}.${String(rest).padStart(2, "0")}`;
}

/** A whole-naira amount typed by a customer ("1,000") → kobo, or null if it isn't one. */
export function nairaToKoboInput(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const naira = Number(cleaned);
  if (!Number.isSafeInteger(naira) || naira <= 0) return null;
  return naira * 100;
}
