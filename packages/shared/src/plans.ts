// Groups data plans by how long they last, from the plan name the provider gives
// (e.g. "N100 100MB - 24 hrs", "MTN 10GB - 30 days"). Names vary, so anything unclear is "other".

export type PlanGroup = "daily" | "weekly" | "monthly" | "other";

export const PLAN_GROUPS: { id: PlanGroup; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "other", label: "Other" },
];

export function planGroup(name: string): PlanGroup {
  const text = name.toLowerCase();
  if (/\bweekly\b|\bweek\b/.test(text)) return "weekly";
  if (/\bmonthly\b|\bmonth\b/.test(text)) return "monthly";
  if (/\bdaily\b/.test(text)) return "daily";
  const hours = /(\d+)\s*(hrs?|hours?)\b/.exec(text);
  if (hours) return Number(hours[1]) <= 72 ? "daily" : "other";
  const days = /(\d+)\s*days?\b/.exec(text);
  if (days) {
    const n = Number(days[1]);
    if (n <= 3) return "daily";
    if (n <= 14) return "weekly";
    if (n <= 31) return "monthly";
  }
  return "other";
}

const SIZE = /(\d+(?:\.\d+)?)\s*(MB|GB|TB)\b/i;

/** True if the plan name has a data size (VTpass mixes voice bundles into data lists). */
export function isDataPlan(name: string): boolean {
  return SIZE.test(name);
}

/** The headline bits of a plan name: "75MB" and "1 day", or nulls when the name doesn't say. */
export function planSummary(name: string): { size: string | null; validity: string | null } {
  const size = SIZE.exec(name);
  const hours = /(\d+)\s*(hrs?|hours?)\b/i.exec(name);
  const days = /(\d+)\s*(days?)\b/i.exec(name);
  const word = /\b(daily|weekly|monthly)\b/i.exec(name);
  let validity: string | null = null;
  if (days) validity = `${days[1]} ${Number(days[1]) === 1 ? "day" : "days"}`;
  else if (hours) validity = `${hours[1]} hrs`;
  else if (word) validity = word[1]!.charAt(0).toUpperCase() + word[1]!.slice(1).toLowerCase();
  return {
    size: size ? `${size[1]}${size[2]!.toUpperCase()}` : null,
    validity: size ? validity : null,
  };
}
