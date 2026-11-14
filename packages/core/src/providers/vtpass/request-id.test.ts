import { describe, expect, it } from "vitest";

import { generateRequestId, lagosTimestamp } from "./request-id.ts";

describe("lagosTimestamp", () => {
  it("formats the time in Africa/Lagos (UTC+1) as YYYYMMDDHHmm", () => {
    expect(lagosTimestamp(new Date("2026-11-14T09:05:00Z"))).toBe("202611141005");
  });

  it("rolls over to the next Lagos day before UTC does", () => {
    expect(lagosTimestamp(new Date("2026-11-14T23:30:00Z"))).toBe("202611150030");
    expect(lagosTimestamp(new Date("2026-12-31T23:59:59Z"))).toBe("202701010059");
  });

  it("uses 00 for midnight, not 24", () => {
    expect(lagosTimestamp(new Date("2026-11-14T23:00:00Z"))).toBe("202611150000");
  });
});

describe("generateRequestId", () => {
  it("starts with the Lagos timestamp, then a random alphanumeric suffix", () => {
    const id = generateRequestId(new Date("2026-11-14T09:05:00Z"));
    expect(id).toMatch(/^202611141005[A-Za-z0-9]{12}$/);
  });

  it("is unique across calls in the same minute", () => {
    const now = new Date("2026-11-14T09:05:00Z");
    const ids = new Set(Array.from({ length: 1000 }, () => generateRequestId(now)));
    expect(ids.size).toBe(1000);
  });

  it("defaults to the current time", () => {
    const before = lagosTimestamp(new Date());
    const id = generateRequestId();
    const after = lagosTimestamp(new Date());
    expect([before, after]).toContain(id.slice(0, 12));
  });
});
