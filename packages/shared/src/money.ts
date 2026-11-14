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

/** ₦1 billion: a typo guard on admin amounts. */
const MAX_ADMIN_KOBO = 100_000_000_000;

/**
 * An amount typed by an admin, in naira with up to 2 decimals ("1,500.50") → kobo, or null.
 * Parsed as text (never via floats): "1,500.50" → 150050.
 */
export function adminNairaToKobo(text: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/,/g, ""));
  if (!match) return null;
  const kobo = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(kobo) || kobo <= 0 || kobo > MAX_ADMIN_KOBO) return null;
  return kobo;
}

/** A discount percentage with up to 2 decimals ("2.5") → basis points (250); 0–99.99%. */
export function percentToBps(text: string): number | null {
  const match = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** Basis points → the shortest percentage text: 250 → "2.5", 100 → "1", 5 → "0.05". */
export function bpsToPercent(bps: number): string {
  const whole = Math.floor(bps / 100);
  const rest = String(bps % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return rest ? `${whole}.${rest}` : String(whole);
}
