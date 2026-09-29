import { describe, expect, it } from "vitest";
import {
  defaultQuickIncrementG,
  formatCompactNumber,
  formatDuration,
  formatWeight,
  fromGrams,
  fromMillimetres,
  roundGramsToIncrement,
  roundTo,
  toGrams,
  toMillimetres,
  trimNumber,
} from "./units";

describe("mass conversion", () => {
  it("round-trips kilograms exactly", () => {
    for (const kg of [0.5, 1.25, 2.5, 20, 60, 102.5, 227.5]) {
      expect(fromGrams(toGrams(kg, "kg"), "kg")).toBeCloseTo(kg, 6);
    }
  });

  it("round-trips pounds within a gram of rounding error", () => {
    for (const lb of [2.5, 5, 45, 135, 225, 315, 495]) {
      expect(fromGrams(toGrams(lb, "lb"), "lb")).toBeCloseTo(lb, 2);
    }
  });

  it("does not drift across repeated unit switches", () => {
    // Canonical grams never change, so switching units 100 times is a no-op on storage.
    const grams = toGrams(100, "kg");
    let current = grams;
    for (let i = 0; i < 100; i += 1) {
      current = toGrams(fromGrams(current, "lb"), "lb");
      current = toGrams(fromGrams(current, "kg"), "kg");
    }
    expect(Math.abs(current - grams)).toBeLessThanOrEqual(1);
  });

  it("formats without trailing zeros", () => {
    expect(formatWeight(toGrams(2.5, "kg"), "kg")).toBe("2.5");
    expect(formatWeight(toGrams(100, "kg"), "kg")).toBe("100");
    expect(formatWeight(toGrams(45, "lb"), "lb")).toBe("45");
  });

  it("shows a metric load converted to pounds", () => {
    expect(formatWeight(toGrams(60, "kg"), "lb")).toBe("132.28");
  });

  it("treats non-finite input as zero", () => {
    expect(toGrams(Number.NaN, "kg")).toBe(0);
    expect(fromGrams(Number.POSITIVE_INFINITY, "kg")).toBe(0);
  });
});

describe("length conversion", () => {
  it("round-trips centimetres and inches", () => {
    expect(fromMillimetres(toMillimetres(42.5, "cm"), "cm")).toBeCloseTo(42.5, 6);
    expect(fromMillimetres(toMillimetres(16.5, "in"), "in")).toBeCloseTo(16.5, 2);
  });
});

describe("rounding", () => {
  it("rounds to increments in each direction", () => {
    expect(roundGramsToIncrement(102_400, 2_500, "nearest")).toBe(102_500);
    expect(roundGramsToIncrement(102_400, 2_500, "down")).toBe(100_000);
    expect(roundGramsToIncrement(102_400, 2_500, "up")).toBe(102_500);
  });

  it("is stable on exact multiples", () => {
    expect(roundGramsToIncrement(100_000, 2_500, "down")).toBe(100_000);
    expect(roundGramsToIncrement(100_000, 2_500, "up")).toBe(100_000);
  });

  it("guards against a zero increment", () => {
    expect(roundGramsToIncrement(1_234, 0)).toBe(1_234);
  });

  it("rounds halves up predictably", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(2.675, 2)).toBe(2.68);
  });

  it("trims numbers for display", () => {
    expect(trimNumber(1.5)).toBe("1.5");
    expect(trimNumber(1.0)).toBe("1");
    expect(trimNumber(-0)).toBe("0");
  });
});

describe("compact display numbers", () => {
  it("keeps small values readable and compacts large values", () => {
    expect(formatCompactNumber(999)).toBe("999");
    expect(formatCompactNumber(5_160_000)).toBe("5.16M");
  });

  it("guards against non-finite values", () => {
    expect(formatCompactNumber(Number.NaN)).toBe("0");
  });
});

describe("defaults", () => {
  it("uses 2.5 kg for metric and 5 lb for imperial", () => {
    expect(defaultQuickIncrementG("metric")).toBe(2_500);
    expect(defaultQuickIncrementG("imperial")).toBe(toGrams(5, "lb"));
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [59, "0:59"],
    [90, "1:30"],
    [3_600, "1:00:00"],
    [3_725, "1:02:05"],
  ])("formats %s seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it("never renders a negative clock", () => {
    expect(formatDuration(-10)).toBe("0:00");
  });
});
