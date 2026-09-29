import type { VerdictFixture } from "./weeklyVerdict.fixtures.helpers";
import { fixtureEntry, mondayBaseline } from "./weeklyVerdict.fixtures.helpers";

export const DATA_CHANGE_FIXTURES: VerdictFixture[] = [
  {
    name: "data: editing hard sets changes direction",
    group: "data_changes",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [...mondayBaseline(10), fixtureEntry("2026-09-08", "last", { hardSets: 12 })],
    expected: { state: "full", directionBand: "up", subjectHardSets: 12 },
  },
  {
    name: "data: kg display independence — grams drive direction",
    group: "data_changes",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [
      ...mondayBaseline(10),
      fixtureEntry("2026-09-08", "last", { hardSets: 10, weightG: 220_462 /* ~486 lb */ }),
    ],
    expected: { state: "full", directionBand: "steady" },
  },
];
