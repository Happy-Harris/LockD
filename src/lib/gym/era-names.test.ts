import { describe, expect, it } from "vitest";
import type { SessionSlice } from "./analytics";
import { buildChronicle } from "./chronicle";
import { ERA_PATTERN_MIN_SESSIONS, trainingPattern, wordEraNames } from "./era-names";

/**
 * Owner, 2026-09-30: automatic era names come from the training record, repeats are told apart by date (never "· 2"),
 * nothing narrative is made up, and a name the lifter typed always wins.
 */
const session = (date: string, name = "Session"): SessionSlice =>
  ({
    workout: { id: `w-${date}`, name, status: "completed", localDate: date },
    exercises: [{ id: `e-${date}`, exerciseId: "bench", exerciseNameSnapshot: "Bench" }],
    sets: [
      { id: `s-${date}`, workoutExerciseId: `e-${date}`, setType: "working", weightG: 100_000, reps: 5, isCompleted: true },
    ],
  }) as unknown as SessionSlice;

/** `count` sessions three days apart from `start`, named in turn from `names`. */
function stretch(start: string, count: number, names = ["Session"]): SessionSlice[] {
  const first = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) =>
    session(new Date(first + i * 3 * 86_400_000).toISOString().slice(0, 10), names[i % names.length]),
  );
}

const names = (slices: SessionSlice[], typed: Array<{ startDate: string; name: string }> = []) =>
  buildChronicle(slices, "epley", [], typed).eras.map((era) => era.name);

const NARRATIVE = /redemption|prime|season|comeback|grind|iron|glory|era\b|·/i;

describe("repeated returns", () => {
  const log = [
    ...stretch("2019-01-07", 8),
    ...stretch("2020-06-01", 8),
    ...stretch("2021-03-01", 8),
    ...stretch("2022-09-05", 8),
  ];

  it("each return is placed by its year, not numbered", () => {
    expect(names(log)).toEqual(["Foundation", "2020 Return", "2021 Return", "2022 Return"]);
  });

  it("no automatic name is narrative or numbered", () => {
    for (const name of names(log)) expect(name).not.toMatch(NARRATIVE);
  });
});

describe("returns in the same year", () => {
  it("two in one year are told apart by half, three by month where the half is shared", () => {
    const log = [
      ...stretch("2023-01-02", 8),
      ...stretch("2024-02-12", 4),
      ...stretch("2024-04-15", 4),
      ...stretch("2024-12-02", 4),
      ...stretch("2025-06-02", 4),
    ];
    expect(names(log)).toEqual([
      "Foundation",
      "February 2024 Return",
      "April 2024 Return",
      "Late 2024 Return",
      "2025 Return",
    ]);
  });

  it("two in the same month fall back to the day", () => {
    expect(
      wordEraNames([
        { startDate: "2024-03-02", base: "Return", dated: true },
        { startDate: "2024-03-28", base: "Return", dated: true },
      ]),
    ).toEqual(["2 March 2024 Return", "28 March 2024 Return"]);
  });
});

describe("brief returns", () => {
  it("one stays plain Brief Return; several are dated, never numbered", () => {
    const one = [...stretch("2023-01-02", 8), session("2023-03-01"), ...stretch("2023-05-01", 8)];
    expect(names(one)).toEqual(["Foundation", "Brief Return", "2023 Return"]);

    const several = [
      ...stretch("2023-01-02", 8),
      session("2024-02-08"),
      session("2024-12-29"),
      session("2025-02-17"),
      ...stretch("2025-05-05", 8),
    ];
    expect(names(several)).toEqual([
      "Foundation",
      "Early 2024 Brief Return",
      "Late 2024 Brief Return",
      "2025 Brief Return",
      "2025 Return",
    ]);
  });
});

describe("names the lifter typed", () => {
  it("are never overwritten, and the automatic name stays alongside for reference", () => {
    const log = [...stretch("2020-01-06", 8), ...stretch("2021-01-04", 8), ...stretch("2021-09-06", 8)];
    const chronicle = buildChronicle(log, "epley", [], [{ startDate: "2021-01-04", name: "Garage gym" }]);
    expect(chronicle.eras.map((era) => [era.name, era.autoName])).toEqual([
      ["Foundation", "Foundation"],
      ["Garage gym", "Early 2021 Return"],
      ["Late 2021 Return", "Late 2021 Return"],
    ]);
  });
});

describe("training split from workout names", () => {
  it("names a clear Push/Pull/Legs or Upper/Lower split", () => {
    expect(trainingPattern(stretch("2024-01-01", 9, ["Push A", "Pull A", "Legs A"]))).toBe("Push/Pull/Legs");
    expect(trainingPattern(stretch("2024-01-01", 8, ["Upper 1", "Lower 1"]))).toBe("Upper/Lower");
    expect(trainingPattern(stretch("2024-01-01", 8, ["Full Body"]))).toBe("Full Body");
  });

  it("does not guess from too few sessions, a weak share, or a split with a day missing", () => {
    expect(trainingPattern(stretch("2024-01-01", ERA_PATTERN_MIN_SESSIONS - 1, ["Upper", "Lower"]))).toBeUndefined();
    expect(trainingPattern(stretch("2024-01-01", 8, ["Upper", "Lower", "Arms", "Cardio"]))).toBeUndefined();
    expect(trainingPattern(stretch("2024-01-01", 8, ["Push", "Pull"]))).toBeUndefined();
    expect(trainingPattern(stretch("2024-01-01", 8, ["Push Pull", "Legs"]))).toBeUndefined();
  });

  it("names a return by its split only when the split changed", () => {
    const log = [
      ...stretch("2022-01-03", 9, ["Push", "Pull", "Legs"]),
      ...stretch("2023-01-02", 8, ["Upper", "Lower"]),
      ...stretch("2024-01-01", 8, ["Upper", "Lower"]),
    ];
    expect(names(log)).toEqual(["Foundation", "2023 Upper/Lower Run", "2024 Return"]);
  });
});
