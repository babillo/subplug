import { describe, expect, it } from "vitest";

import { formatNaira, nairaToKoboInput } from "./money";

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
