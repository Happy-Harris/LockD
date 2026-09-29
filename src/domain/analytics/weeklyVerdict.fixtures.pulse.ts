import type { LoggedEntry } from "./compute";
import type { VerdictFixture } from "./weeklyVerdict.fixtures.helpers";
import { fixtureEntry, mondayBaseline, shiftDate } from "./weeklyVerdict.fixtures.helpers";

export const PULSE_FIXTURES: VerdictFixture[] = [
  {
    name: "pulse: hidden on day 1 (Monday)",
    group: "pulse",
    weekStart: "monday",
    reference: "2026-09-14T12:00:00.000Z",
    entries: [...mondayBaseline(10), fixtureEntry("2026-09-08", "last", { hardSets: 10 })],
    expected: { state: "full", pulseNull: true },
  },
  {
    name: "pulse: same elapsed span on day 2, never full weeks",
    group: "pulse",
    weekStart: "monday",
    reference: "2026-09-15T12:00:00.000Z",
    entries: (() => {
      const entries: LoggedEntry[] = [];
      for (const [week, prefix] of [
        ["2026-08-17", "a"],
        ["2026-08-24", "b"],
        ["2026-08-31", "c"],
        ["2026-09-07", "d"],
      ] as const) {
        entries.push(fixtureEntry(week, `${prefix}-early`, { hardSets: 2 }));
        entries.push(fixtureEntry(shiftDate(week, 4), `${prefix}-late`, { hardSets: 8 }));
      }
      entries.push(fixtureEntry("2026-09-14", "current", { hardSets: 2 }));
      return entries;
    })(),
    expected: {
      state: "full",
      pulseCurrentHardSets: 2,
      pulseBaselineHardSets: 2,
      neverPartialVsFull: true,
    },
  },
  {
    name: "pulse: Saturday week day-1 hidden",
    group: "pulse",
    weekStart: "saturday",
    reference: "2026-09-12T12:00:00.000Z",
    entries: [
      fixtureEntry("2026-08-08", "b1", { hardSets: 10 }),
      fixtureEntry("2026-08-15", "b2", { hardSets: 10 }),
      fixtureEntry("2026-08-22", "b3", { hardSets: 10 }),
      fixtureEntry("2026-08-29", "b4", { hardSets: 10 }),
      fixtureEntry("2026-09-06", "last", { hardSets: 10 }),
    ],
    expected: { state: "full", pulseNull: true },
  },
  {
    name: "pulse: Sunday week same-span",
    group: "pulse",
    weekStart: "sunday",
    reference: "2026-09-15T12:00:00.000Z",
    entries: (() => {
      const entries: LoggedEntry[] = [];
      for (const [week, prefix] of [
        ["2026-08-16", "a"],
        ["2026-08-23", "b"],
        ["2026-08-30", "c"],
        ["2026-09-06", "d"],
      ] as const) {
        entries.push(fixtureEntry(week, `${prefix}-early`, { hardSets: 3 }));
        entries.push(fixtureEntry(shiftDate(week, 3), `${prefix}-late`, { hardSets: 7 }));
      }
      entries.push(fixtureEntry("2026-09-13", "current", { hardSets: 3 }));
      return entries;
    })(),
    expected: {
      state: "full",
      pulseCurrentHardSets: 3,
      pulseBaselineHardSets: 3,
      neverPartialVsFull: true,
    },
  },
  {
    name: "pulse: insufficient history yields null pulse",
    group: "pulse",
    weekStart: "monday",
    reference: "2026-09-16T12:00:00.000Z",
    entries: [
      fixtureEntry("2026-08-31", "b1", { hardSets: 10 }),
      fixtureEntry("2026-09-08", "last", { hardSets: 10 }),
      fixtureEntry("2026-09-15", "current", { hardSets: 2 }),
    ],
    expected: { state: "not_enough_history", pulseNull: true },
  },
];
