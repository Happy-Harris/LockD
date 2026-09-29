import type { LoggedEntry } from "./compute";
import type { VerdictFixture } from "./weeklyVerdict.fixtures.helpers";
import { fixtureEntry, mondayBaseline, shiftDate } from "./weeklyVerdict.fixtures.helpers";

export const ELIGIBILITY_FIXTURES: VerdictFixture[] = [
  {
    name: "eligibility: zero baseline weeks stays locked",
    group: "eligibility",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [fixtureEntry("2026-09-08", "only")],
    expected: { state: "not_enough_history", baselineWeeks: 0 },
  },
  {
    name: "eligibility: one baseline week stays locked",
    group: "eligibility",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [
      fixtureEntry("2026-08-31", "b1", { hardSets: 10 }),
      fixtureEntry("2026-09-08", "last"),
    ],
    expected: { state: "not_enough_history", baselineWeeks: 1 },
  },
  {
    name: "eligibility: two baseline weeks stays locked",
    group: "eligibility",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [
      fixtureEntry("2026-08-24", "b1", { hardSets: 10 }),
      fixtureEntry("2026-08-31", "b2", { hardSets: 10 }),
      fixtureEntry("2026-09-08", "last", { hardSets: 10 }),
    ],
    expected: { state: "not_enough_history", baselineWeeks: 2 },
  },
  {
    name: "eligibility: three baseline weeks unlocks full",
    group: "eligibility",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [
      fixtureEntry("2026-08-17", "b1", { hardSets: 10 }),
      fixtureEntry("2026-08-24", "b2", { hardSets: 10 }),
      fixtureEntry("2026-08-31", "b3", { hardSets: 10 }),
      fixtureEntry("2026-09-08", "last", { hardSets: 10 }),
    ],
    expected: { state: "full", baselineWeeks: 3, directionBand: "steady" },
  },
  {
    name: "eligibility: four baseline weeks preferred",
    group: "eligibility",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [...mondayBaseline(10), fixtureEntry("2026-09-08", "last", { hardSets: 10 })],
    expected: { state: "full", baselineWeeks: 4, directionBand: "steady" },
  },
  {
    name: "eligibility: empty weeks inside lookback are skipped",
    group: "eligibility",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [
      fixtureEntry("2026-07-20", "old", { hardSets: 10 }),
      fixtureEntry("2026-08-17", "b1", { hardSets: 10 }),
      fixtureEntry("2026-08-31", "b2", { hardSets: 10 }),
      fixtureEntry("2026-09-08", "last", { hardSets: 10 }),
    ],
    expected: { state: "full", baselineWeeks: 3 },
  },
  {
    name: "eligibility: warmups-only week does not count hard sets",
    group: "eligibility",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [
      ...mondayBaseline(10),
      fixtureEntry("2026-09-08", "last", { hardSets: 0, warmups: 6 }),
    ],
    expected: { state: "deload", subjectHardSets: 0 },
  },
  {
    name: "eligibility: drops and failures never count as hard sets",
    group: "eligibility",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: (() => {
      const entries: LoggedEntry[] = [];
      for (const [week, prefix] of [
        ["2026-08-10", "a"],
        ["2026-08-17", "b"],
        ["2026-08-24", "c"],
        ["2026-08-31", "d"],
      ] as const) {
        entries.push(fixtureEntry(week, `${prefix}1`, { hardSets: 5 }));
        entries.push(fixtureEntry(shiftDate(week, 2), `${prefix}2`, { hardSets: 5 }));
      }
      entries.push(fixtureEntry("2026-09-08", "last", { hardSets: 2, drops: 4, failures: 3 }));
      return entries;
    })(),
    expected: { state: "full", subjectHardSets: 2, directionBand: "well_down" },
  },
];
