// VTpass request_id rules (vtpass.com/documentation/how-to-generate-request-id):
// - at least 12 characters
// - first 12 = today's date and time in Africa/Lagos (UTC+1) as YYYYMMDDHHmm
// - then any alphanumeric suffix
// Each order gets a new one, and we store it with the order (unique in the DB), so a retry of the
// same order reuses the same request_id and VTpass can't charge it twice.

const lagosFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Formats a moment as YYYYMMDDHHmm in Lagos time. */
export function lagosTimestamp(date: Date): string {
  const parts = Object.fromEntries(
    lagosFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}`;
}

const SUFFIX_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SUFFIX_LENGTH = 12;

/** Generates a VTpass-valid request_id, e.g. "202611141005" + "q8ZkT2mAa9Lx". */
export function generateRequestId(now: Date = new Date()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SUFFIX_LENGTH));
  // 248 is the largest multiple of 62 below 256; re-rolling above it keeps every character equally likely.
  let suffix = "";
  for (const byte of bytes) {
    if (byte < 248) suffix += SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length];
  }
  while (suffix.length < SUFFIX_LENGTH) {
    const [byte = 255] = crypto.getRandomValues(new Uint8Array(1));
    if (byte < 248) suffix += SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length];
  }
  return lagosTimestamp(now) + suffix;
}

/** True if the id has VTpass's shape: 12 timestamp digits, then optional letters/digits. */
export function isValidRequestId(id: string): boolean {
  return /^\d{12}[A-Za-z0-9]*$/.test(id);
}
