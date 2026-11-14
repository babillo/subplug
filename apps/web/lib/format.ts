// Display formats shared by the customer and admin screens. Times are always Lagos time.
const dateTime = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dateOnly = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "14 Nov, 10:05 am" in Lagos time. */
export function formatWhen(value: Date | string): string {
  return dateTime.format(new Date(value));
}

/** "14 Nov 2026" in Lagos time. */
export function formatDay(value: Date | string): string {
  return dateOnly.format(new Date(value));
}

/** Plain-words names for ledger entry reasons. */
export const LEDGER_REASONS: Record<string, string> = {
  funding: "Wallet funded",
  purchase: "Purchase",
  refund: "Refund",
  admin_credit: "Credit from support",
  admin_debit: "Debit by support",
  seed: "Test credit",
};
