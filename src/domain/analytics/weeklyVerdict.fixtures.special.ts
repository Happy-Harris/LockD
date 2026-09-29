import type { VerdictFixture } from "./weeklyVerdict.fixtures.helpers";
import { fixtureEntry, mondayBaseline } from "./weeklyVerdict.fixtures.helpers";

export const SPECIAL_STATE_FIXTURES: VerdictFixture[] = [
  {
    name: "special: welcome back after two empty prior weeks",
    group: "special_states",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [
      fixtureEntry("2026-08-03", "old1", { hardSets: 8 }),
      fixtureEntry("2026-08-10", "old2", { hardSets: 8 }),
      fixtureEntry("2026-08-17", "old3", { hardSets: 8 }),
      fixtureEntry("2026-09-08", "return", { hardSets: 8 }),
    ],
    expected: { state: "welcome_back" },
  },
  {
    name: "special: deload-shaped when hard sets fall and sessions hold",
    group: "special_states",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [
      ...mondayBaseline(10).flatMap((row, index) => [
        row,
        fixtureEntry(row.workout.localDate, `b-extra-${index}`, { hardSets: 1 }),
      ]),
      fixtureEntry("2026-09-08", "last-a", { hardSets: 3 }),
      fixtureEntry("2026-09-11", "last-b", { hardSets: 2 }),
    ],
    expected: { state: "deload" },
  },
  {
    name: "special: not enough history",
    group: "special_states",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [fixtureEntry("2026-09-08", "only", { hardSets: 10 })],
    expected: { state: "not_enough_history" },
  },
  {
    name: "special: full steady week",
    group: "special_states",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [...mondayBaseline(10), fixtureEntry("2026-09-08", "last", { hardSets: 10 })],
    expected: { state: "full", directionBand: "steady" },
  },
];
