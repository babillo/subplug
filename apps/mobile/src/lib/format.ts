// Times are always shown in Lagos time.
const dateTime = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "14 Nov, 10:05 am" in Lagos time. */
export function formatWhen(value: string | Date): string {
  return dateTime.format(new Date(value));
}

export const LEDGER_REASONS: Record<string, string> = {
  funding: "Wallet funded",
  purchase: "Purchase",
  refund: "Refund",
  admin_credit: "Credit from support",
  admin_debit: "Debit by support",
  seed: "Test credit",
};
