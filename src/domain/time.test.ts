import { describe, expect, it } from "vitest";
import type { WeekStartDay } from "./types";
import {
  formatWeekday,
  localDateOf,
  previousRange,
  resolveRange,
  startOfTrainingWeek,
  todayHeader,
} from "./time";

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

describe("today is the lifter's own date, not UTC's (plan I-24)", () => {
  const inZone = <T>(zone: string, run: () => T): T => {
    const original = process.env.TZ;
    process.env.TZ = zone;
    try {
      return run();
    } finally {
      process.env.TZ = original;
    }
  };

  it("west of UTC in the evening it is still today, where UTC has already moved on", () => {
    // 20:00 on Tuesday 29 Sep in Los Angeles (UTC-7) is 03:00 on Wednesday 30 Sep UTC.
    const instant = new Date("2026-09-30T03:00:00.000Z");
    inZone("America/Los_Angeles", () => {
      expect(instant.toISOString().slice(0, 10)).toBe("2026-09-30"); // the old code: tomorrow
      expect(localDateOf(instant)).toBe("2026-09-29");
      expect(todayHeader(instant)).toBe(formatWeekday("2026-09-29"));
      expect(todayHeader(instant)).not.toBe(formatWeekday("2026-09-30"));
    });
  });

  it("far east in the early morning it is already today, where UTC is still yesterday", () => {
    // 01:00 on Wednesday 30 Sep in Auckland (UTC+13 in daylight time) is 12:00 on Tuesday 29 Sep UTC.
    const instant = new Date("2026-09-29T12:00:00.000Z");
    inZone("Pacific/Auckland", () => {
      expect(instant.toISOString().slice(0, 10)).toBe("2026-09-29"); // the old code: yesterday
      expect(localDateOf(instant)).toBe("2026-09-30");
      expect(todayHeader(instant)).toBe(formatWeekday("2026-09-30"));
    });
  });

  it("in UTC it agrees with the old answer", () => {
    inZone("UTC", () => {
      const instant = new Date("2026-09-29T12:00:00.000Z");
      expect(localDateOf(instant)).toBe(instant.toISOString().slice(0, 10));
    });
  });
});
