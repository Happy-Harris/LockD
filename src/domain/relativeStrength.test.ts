import { describe, expect, it } from "vitest";
import { formatRatio, relativeStrength } from "./relativeStrength";
import type { BodyMeasurement } from "./types";

const m = (
  id: string,
  localDate: string,
  value: number,
  metric: BodyMeasurement["metric"] = "bodyweight",
  recordedAt = `${localDate}T08:00:00.000Z`,
): BodyMeasurement => ({
  id,
  metric,
  value,
  displayUnit: "kg",
  recordedAt,
  localDate,
  createdAt: "",
  updatedAt: "",
});

describe("est. 1RM as a multiple of body weight", () => {
  const list = [
    m("a", "2026-01-01", 80_000),
    m("b", "2026-03-01", 84_000),
    m("c", "2026-05-01", 90_000),
  ];

  it("uses the latest body weight on or before the lift, so a later change never rewrites it", () => {
    const result = relativeStrength(126_000, "2026-03-15", list)!;
    expect(result).toMatchObject({
      bodyweightG: 84_000,
      bodyweightDate: "2026-03-01",
      e1rmG: 126_000,
      e1rmDate: "2026-03-15",
    });
    expect(result.ratio).toBeCloseTo(1.5, 10);
    expect(relativeStrength(126_000, "2026-03-01", list)!.bodyweightG).toBe(84_000); // same day counts
    expect(relativeStrength(126_000, "2026-06-01", list)!.bodyweightG).toBe(90_000);
  });

  it("is null, not a guess, when no body weight was recorded by then", () => {
    expect(relativeStrength(126_000, "2025-12-31", list)).toBeNull();
    expect(relativeStrength(126_000, "2026-03-15", [])).toBeNull();
  });

  it("ignores other measurements, a zero weight, and a missing lift", () => {
    expect(
      relativeStrength(100_000, "2026-03-15", [m("x", "2026-03-01", 340, "arm_left")]),
    ).toBeNull();
    expect(relativeStrength(100_000, "2026-03-15", [m("x", "2026-03-01", 0)])).toBeNull();
    expect(relativeStrength(0, "2026-03-15", list)).toBeNull();
  });

  it("takes the later record when two share a day", () => {
    const two = [
      m("a", "2026-03-01", 84_000, "bodyweight", "2026-03-01T07:00:00.000Z"),
      m("b", "2026-03-01", 85_000, "bodyweight", "2026-03-01T19:00:00.000Z"),
    ];
    expect(relativeStrength(100_000, "2026-03-02", two)!.bodyweightG).toBe(85_000);
  });

  it("writes the ratio to two decimals", () => {
    expect(formatRatio(1.5)).toBe("1.50×");
    expect(formatRatio(1.4249)).toBe("1.42×");
    expect(formatRatio(0.999)).toBe("1.00×");
  });
});
