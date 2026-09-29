import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  elapsedSeconds,
  formatDate,
  localDateOf,
  localDateToOrdinal,
  nowParts,
  ordinalToLocalDate,
  relativeDay,
  utcOffsetMinutes,
} from "./time";

/** The suite is pinned to UTC (src/test/global-setup.ts); these tests visit other zones on purpose. */
function inZone<T>(zone: string, run: () => T): T {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try {
    return run();
  } finally {
    process.env.TZ = before;
  }
}

describe("stored timezone offset: the raw getTimezoneOffset(), positive WEST of UTC", () => {
  const winter = new Date(Date.UTC(2026, 0, 15, 12));
  const summer = new Date(Date.UTC(2026, 6, 15, 12));

  it.each([
    ["America/Chicago", "January", 360, -360, winter],
    ["America/Chicago", "July (DST)", 300, -300, summer],
    ["Asia/Dubai", "January", -240, 240, winter],
    ["Europe/London", "July (BST)", -60, 60, summer],
    ["UTC", "January", 0, 0, winter],
  ] as const)("%s, %s: stores %i, utcOffsetMinutes is %i", (zone, _label, stored, east, moment) => {
    inZone(zone, () => {
      expect(nowParts(moment).tzOffsetMinutes).toBe(stored);
      expect(utcOffsetMinutes(moment)).toBe(east);
      expect(nowParts(moment).tzOffsetMinutes + utcOffsetMinutes(moment)).toBe(0);
    });
  });

  it("nowParts returns the ISO instant, the local date and the offset together", () => {
    const parts = inZone("Pacific/Auckland", () =>
      nowParts(new Date(Date.UTC(2026, 8, 28, 23, 30))),
    );
    expect(parts).toEqual({
      iso: "2026-09-28T23:30:00.000Z",
      localDate: "2026-09-29",
      tzOffsetMinutes: -780,
    });
  });

  it("the same instant is a different local date in different zones", () => {
    const instant = new Date(Date.UTC(2026, 8, 28, 23, 30));
    expect(inZone("America/Chicago", () => localDateOf(instant))).toBe("2026-09-28");
    expect(inZone("Pacific/Auckland", () => localDateOf(instant))).toBe("2026-09-29");
  });
});

describe("calendar ordinals do not depend on the machine's timezone or DST", () => {
  const dates = [
    "2024-02-28",
    "2024-02-29",
    "2024-03-01",
    "2025-12-31",
    "2026-01-01",
    "2026-03-08",
    "2026-03-29",
    "2026-11-01",
  ];

  it("round-trips every date, including a leap day and both DST change days", () => {
    for (const date of dates) expect(ordinalToLocalDate(localDateToOrdinal(date))).toBe(date);
  });

  it.each(["America/Chicago", "Europe/London", "Pacific/Auckland"])(
    "%s: consecutive days are one ordinal apart",
    (zone) => {
      inZone(zone, () => {
        expect(localDateToOrdinal("2026-03-09") - localDateToOrdinal("2026-03-08")).toBe(1);
        expect(localDateToOrdinal("2026-03-30") - localDateToOrdinal("2026-03-29")).toBe(1);
        expect(localDateToOrdinal("2026-11-02") - localDateToOrdinal("2026-11-01")).toBe(1);
      });
    },
  );

  it("counts days across a year boundary", () => {
    expect(localDateToOrdinal("2026-01-01") - localDateToOrdinal("2025-01-01")).toBe(365);
    expect(localDateToOrdinal("2025-01-01") - localDateToOrdinal("2024-01-01")).toBe(366);
  });
});

describe("addDays", () => {
  it("adds calendar days across a DST change and keeps the wall-clock hour", () => {
    inZone("America/Chicago", () => {
      const start = new Date(2026, 2, 7, 12); // 7 Mar, the evening before US clocks spring forward
      const next = addDays(start, 1);
      const after = addDays(start, 2);
      expect([localDateOf(next), next.getHours()]).toEqual(["2026-03-08", 12]);
      expect([localDateOf(after), after.getHours()]).toEqual(["2026-03-09", 12]);
    });
  });

  it("does not mutate its input", () => {
    const start = new Date(2026, 8, 28, 12);
    addDays(start, 5);
    expect(localDateOf(start)).toBe("2026-09-28");
  });
});

describe("elapsedSeconds", () => {
  const start = "2026-09-28T10:00:00.000Z";
  const end = "2026-09-28T11:00:00.000Z";

  it("is the span minus paused time", () => {
    expect(elapsedSeconds(start, end)).toBe(3600);
    expect(elapsedSeconds(start, end, 600)).toBe(3000);
  });

  it("never goes negative, and a negative pause cannot add time", () => {
    expect(elapsedSeconds(start, end, 9999)).toBe(0);
    expect(elapsedSeconds(start, end, -500)).toBe(3600);
    expect(elapsedSeconds(end, start)).toBe(0);
  });

  it("gives 0 for an unreadable start or end rather than NaN", () => {
    expect(elapsedSeconds("not a date", end)).toBe(0);
    expect(elapsedSeconds(start, "not a date")).toBe(0);
  });
});

describe("relativeDay and formatDate", () => {
  afterEach(() => vi.useRealTimers());

  it("labels recent days plainly and falls back to a date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 28, 12));
    expect(relativeDay(new Date(2026, 8, 28, 6))).toBe("Today");
    expect(relativeDay(new Date(2026, 8, 27, 23))).toBe("Yesterday");
    expect(relativeDay(new Date(2026, 8, 25, 12))).toBe("3 days ago");
    expect(relativeDay(new Date(2026, 8, 10, 12))).toBe(formatDate(new Date(2026, 8, 10, 12)));
  });

  it("shows a dash for a missing or unreadable date, never a fake one", () => {
    expect(formatDate("garbage")).toBe("—");
    expect(relativeDay("garbage")).toBe("—");
  });
});
