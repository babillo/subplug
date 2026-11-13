import { describe, expect, it } from "vitest";

import { assertKobo, formatNaira, nairaToKobo } from "./money";

describe("nairaToKobo", () => {
  it("converts whole naira to kobo", () => {
    expect(nairaToKobo(0)).toBe(0);
    expect(nairaToKobo(1)).toBe(100);
    expect(nairaToKobo(1500)).toBe(150_000);
  });

  it("rejects fractional naira so floats never sneak in", () => {
    expect(() => nairaToKobo(10.5)).toThrow(TypeError);
    expect(() => nairaToKobo(0.1 + 0.2)).toThrow(TypeError);
  });
});

describe("assertKobo", () => {
  it("accepts integers and rejects floats, NaN and unsafe numbers", () => {
    expect(() => assertKobo(100)).not.toThrow();
    expect(() => assertKobo(1.5)).toThrow(TypeError);
    expect(() => assertKobo(Number.NaN)).toThrow(TypeError);
    expect(() => assertKobo(Number.MAX_SAFE_INTEGER + 1)).toThrow(TypeError);
  });
});

describe("formatNaira", () => {
  it("formats kobo as naira with thousands separators", () => {
    expect(formatNaira(0)).toBe("₦0.00");
    expect(formatNaira(5)).toBe("₦0.05");
    expect(formatNaira(150_050)).toBe("₦1,500.50");
    expect(formatNaira(-2_500)).toBe("-₦25.00");
  });
});
