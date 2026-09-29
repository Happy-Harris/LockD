import type { VerdictFixture } from "./weeklyVerdict.fixtures.helpers";
import { fixtureEntry, mondayBaseline } from "./weeklyVerdict.fixtures.helpers";

export const WINDOW_FIXTURES: VerdictFixture[] = [
  {
    name: "windows: Monday week subject starts 2026-09-07",
    group: "windows",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [...mondayBaseline(10), fixtureEntry("2026-09-08", "last", { hardSets: 12 })],
    expected: { state: "full", subjectStart: "2026-09-07", subjectHardSets: 12 },
  },
  {
    name: "windows: Sunday week subject starts 2026-09-06",
    group: "windows",
    weekStart: "sunday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [
      fixtureEntry("2026-08-09", "b1", { hardSets: 10 }),
      fixtureEntry("2026-08-16", "b2", { hardSets: 10 }),
      fixtureEntry("2026-08-23", "b3", { hardSets: 10 }),
      fixtureEntry("2026-09-07", "last", { hardSets: 11 }),
      fixtureEntry("2026-08-30", "b4", { hardSets: 10 }),
    ],
    expected: { state: "full", subjectStart: "2026-09-06", subjectHardSets: 11 },
  },
  {
    name: "windows: Saturday week subject starts 2026-09-05",
    group: "windows",
    weekStart: "saturday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [
      fixtureEntry("2026-08-08", "b1", { hardSets: 10 }),
      fixtureEntry("2026-08-15", "b2", { hardSets: 10 }),
      fixtureEntry("2026-08-22", "b3", { hardSets: 10 }),
      fixtureEntry("2026-08-29", "b4", { hardSets: 10 }),
      fixtureEntry("2026-09-06", "last", { hardSets: 13 }),
    ],
    expected: { state: "full", subjectStart: "2026-09-05", subjectHardSets: 13 },
  },
  {
    name: "windows: 23:50 local session stays on stored localDate (Sunday week)",
    group: "windows",
    weekStart: "sunday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [
      fixtureEntry("2026-08-09", "b1", { hardSets: 10 }),
      fixtureEntry("2026-08-16", "b2", { hardSets: 10 }),
      fixtureEntry("2026-08-23", "b3", { hardSets: 10 }),
      fixtureEntry("2026-08-30", "b4", { hardSets: 10 }),
      fixtureEntry("2026-09-06", "late", {
        hardSets: 9,
        startedAt: "2026-09-06T23:50:00.000+04:00",
      }),
    ],
    expected: { state: "full", subjectStart: "2026-09-06", subjectHardSets: 9 },
  },
  {
    name: "windows: current partial week is never the subject",
    group: "windows",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [
      ...mondayBaseline(10),
      fixtureEntry("2026-09-08", "last", { hardSets: 12 }),
      fixtureEntry("2026-09-15", "current", { hardSets: 99 }),
    ],
    expected: { state: "full", subjectStart: "2026-09-07", subjectHardSets: 12 },
  },
  {
    name: "windows: Saturday boundary session on week start date",
    group: "windows",
    weekStart: "saturday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [
      fixtureEntry("2026-08-08", "b1", { hardSets: 10 }),
      fixtureEntry("2026-08-15", "b2", { hardSets: 10 }),
      fixtureEntry("2026-08-22", "b3", { hardSets: 10 }),
      fixtureEntry("2026-08-29", "b4", { hardSets: 10 }),
      fixtureEntry("2026-09-05", "boundary", { hardSets: 8 }),
    ],
    expected: { state: "full", subjectStart: "2026-09-05", subjectHardSets: 8 },
  },
  {
    name: "windows: Monday boundary session on week end date",
    group: "windows",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [...mondayBaseline(10), fixtureEntry("2026-09-13", "end", { hardSets: 7 })],
    expected: { state: "full", subjectStart: "2026-09-07", subjectHardSets: 7 },
  },
  {
    name: "windows: session before subject week is baseline not subject",
    group: "windows",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [
      ...mondayBaseline(10),
      fixtureEntry("2026-09-06", "prior-end", { hardSets: 1 }),
      fixtureEntry("2026-09-08", "last", { hardSets: 11 }),
    ],
    expected: { state: "full", subjectStart: "2026-09-07", subjectHardSets: 11 },
  },
];
