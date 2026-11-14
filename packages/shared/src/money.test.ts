import { describe, expect, it } from "vitest";

import {
  adminNairaToKobo,
  bpsToPercent,
  formatNaira,
  nairaToKoboInput,
  percentToBps,
} from "./money";

describe("formatNaira", () => {
  it("formats kobo as naira with separators", () => {
    expect(formatNaira(0)).toBe("₦0.00");
    expect(formatNaira(150_050)).toBe("₦1,500.50");
    expect(formatNaira(-2_500)).toBe("-₦25.00");
  });
  it("can drop zero kobo for compact display", () => {
    expect(formatNaira(35_000, { compact: true })).toBe("₦350");
    expect(formatNaira(35_050, { compact: true })).toBe("₦350.50");
  });
});

describe("nairaToKoboInput", () => {
  it("turns what a customer typed (whole naira) into kobo", () => {
    expect(nairaToKoboInput("500")).toBe(50_000);
    expect(nairaToKoboInput(" 1,000 ")).toBe(100_000);
  });
  it("rejects anything that isn't a whole naira amount", () => {
    for (const bad of ["", "abc", "10.50", "-5", "0", "1e3"])
      expect(nairaToKoboInput(bad)).toBeNull();
  });
});

describe("adminNairaToKobo", () => {
  it.each([
    ["1500", 150_000],
    ["1,500.5", 150_050],
    ["0.01", 1],
    [" 20.05 ", 2_005],
  ])("%s → %s kobo", (text, kobo) => {
    expect(adminNairaToKobo(text)).toBe(kobo);
  });
  it.each(["", "0", "0.00", "-5", "1.234", "1e3", "abc", "1..2", "99999999999999"])(
    "rejects %j",
    (text) => {
      expect(adminNairaToKobo(text)).toBeNull();
    },
  );
});

describe("percentToBps / bpsToPercent", () => {
  it.each([
    ["1", 100],
    ["2.5", 250],
    ["0", 0],
    ["0.05", 5],
    ["99.99", 9_999],
  ])("%s%% → %s bps", (text, bps) => {
    expect(percentToBps(text)).toBe(bps);
    expect(bpsToPercent(bps)).toBe(text);
  });
  it.each(["100", "-1", "1.234", "abc", ""])("rejects %j", (text) => {
    expect(percentToBps(text)).toBeNull();
  });
});
