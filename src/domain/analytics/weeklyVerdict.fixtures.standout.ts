import type { LoggedEntry } from "./compute";
import type { VerdictFixture } from "./weeklyVerdict.fixtures.helpers";
import { fixtureEntry, mondayBaseline, shiftDate } from "./weeklyVerdict.fixtures.helpers";

export const STANDOUT_WATCHOUT_FIXTURES: VerdictFixture[] = [
  {
    name: "standout: new e1RM best",
    group: "standout_watchout",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [
      ...mondayBaseline(4),
      fixtureEntry("2026-09-08", "last", { hardSets: 4, weightG: 110_000, reps: 5 }),
    ],
    expected: { state: "full", standoutId: "standout_new_e1rm_best" },
  },
  {
    name: "watchout: sessions drop",
    group: "standout_watchout",
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
        entries.push(fixtureEntry(shiftDate(week, 3), `${prefix}2`, { hardSets: 5 }));
      }
      entries.push(fixtureEntry("2026-09-08", "last", { hardSets: 10 }));
      return entries;
    })(),
    expected: { state: "full", directionBand: "steady", watchoutId: "watchout_sessions_down" },
  },
  {
    name: "watchout: big jump recovery note",
    group: "standout_watchout",
    weekStart: "monday",
    reference: "2026-09-17T12:00:00.000Z",
    entries: [...mondayBaseline(10), fixtureEntry("2026-09-08", "last", { hardSets: 16 })],
    expected: { state: "full", directionBand: "big_jump", watchoutId: "watchout_big_jump" },
  },
];
