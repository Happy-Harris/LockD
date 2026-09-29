import { describe, expect, it } from "vitest";
import type { WeekStartDay } from "./types";
import { localDateOf, previousRange, resolveRange, startOfTrainingWeek } from "./time";

describe("analytics ranges", () => {
  const reference = new Date(2026, 8, 17, 12, 30, 0);

  it("keeps Monday as the backwards-compatible default for This week", () => {
    const range = resolveRange("this_week", reference);
    expect(range.from).toEqual(new Date(2026, 8, 14, 0, 0, 0, 0));
    expect(range.to).toBe(reference);
  });

  it.each([
    ["monday", "2026-09-14"],
    ["sunday", "2026-09-13"],
    ["saturday", "2026-09-12"],
  ] as const)("starts a %s training week at local midnight", (weekStart, expected) => {
    const start = startOfTrainingWeek(reference, weekStart as WeekStartDay);
    expect(localDateOf(start)).toBe(expected);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it("uses the configured week start for This week", () => {
    const range = resolveRange("this_week", reference, "saturday");
    expect(range.from).toEqual(new Date(2026, 8, 12, 0, 0, 0, 0));
    expect(range.to).toBe(reference);
  });

  it.each([
    ["4w", 28],
    ["8w", 56],
    ["12w", 84],
  ] as const)("uses exact week multiples for %s", (key, days) => {
    const range = resolveRange(key, reference);
    const expected = new Date(reference);
    expected.setDate(expected.getDate() - days);
    expected.setHours(0, 0, 0, 0);
    expect(range.from).toEqual(expected);
  });

  it("builds the immediately preceding rolling window", () => {
    const current = resolveRange("4w", reference);
    const previous = previousRange("4w", reference);
    expect(previous?.to.getTime()).toBe((current.from?.getTime() ?? 0) - 1);
    expect(previous?.from).toEqual(new Date(2026, 6, 23, 0, 0, 0, 0));
  });

  it("does not count the configured week start midnight in both current and prior week", () => {
    const current = resolveRange("this_week", reference, "saturday");
    const previous = previousRange("this_week", reference, "saturday");
    expect(previous?.to.getTime()).toBe((current.from?.getTime() ?? 0) - 1);
    expect(previous?.from).toEqual(new Date(2026, 8, 5, 0, 0, 0, 0));
  });

  it("has no prior window for All", () => {
    expect(previousRange("all", reference)).toBeNull();
  });
});
