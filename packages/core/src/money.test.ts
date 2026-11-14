import { describe, expect, it } from "vitest";

import { assertKobo, decimalToKobo, formatNaira, koboToWholeNaira, nairaToKobo } from "./money.ts";

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

describe("decimalToKobo", () => {
  it("converts provider decimal strings to kobo without float maths", () => {
    expect(decimalToKobo("100.00")).toBe(10_000);
    expect(decimalToKobo("50")).toBe(5_000);
    expect(decimalToKobo("0.5")).toBe(50);
    expect(decimalToKobo("1,500.50")).toBe(150_050);
    expect(decimalToKobo("-2.5")).toBe(-250);
  });

  it("rounds half-up at the third decimal place", () => {
    expect(decimalToKobo("1081.8199999998")).toBe(108_182);
    expect(decimalToKobo("1.005")).toBe(101);
    expect(decimalToKobo("1.004")).toBe(100);
    expect(decimalToKobo("-1.005")).toBe(-101);
  });

  it("accepts plain JSON numbers (e.g. a balance) via their decimal text", () => {
    expect(decimalToKobo(1081.8199999998)).toBe(108_182);
    expect(decimalToKobo(0.1 + 0.2)).toBe(30);
    expect(decimalToKobo(250)).toBe(25_000);
  });

  it("rejects anything that is not a plain decimal", () => {
    for (const bad of ["", "abc", "1.2.3", "1e3", "₦100", " ", "--1"]) {
      expect(() => decimalToKobo(bad)).toThrow(TypeError);
    }
    expect(() => decimalToKobo(Number.NaN)).toThrow(TypeError);
    expect(() => decimalToKobo(1e21)).toThrow(TypeError);
  });
});

describe("koboToWholeNaira", () => {
  it("converts kobo to whole naira for providers that take naira", () => {
    expect(koboToWholeNaira(10_000)).toBe(100);
    expect(koboToWholeNaira(0)).toBe(0);
  });

  it("refuses amounts with leftover kobo instead of sending a fraction", () => {
    expect(() => koboToWholeNaira(10_050)).toThrow(RangeError);
    expect(() => koboToWholeNaira(1.5)).toThrow(TypeError);
  });
});
