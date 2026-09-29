import { describe, expect, it } from "vitest";
import type { SetType, Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import type { AnalyticsOptions, LoggedEntry } from "./compute";
import { weeklyVerdict, weeklyVerdictCopy } from "./weeklyVerdict";

const options: AnalyticsOptions = {
  formula: "epley",
  includeWarmups: false,
  secondaryCredit: 0.5,
};

interface EntryOptions {
  exerciseId?: string;
  exerciseName?: string;
  hardSets?: number;
  warmups?: number;
  drops?: number;
  failures?: number;
  weightG?: number;
  reps?: number;
}

function entry(localDate: string, id: string, config: EntryOptions = {}): LoggedEntry {
  const startedAt = `${localDate}T10:00:00.000Z`;
  const workout: Workout = {
    id: `workout-${id}`,
    name: "Session",
    status: "completed",
    startedAt,
    endedAt: startedAt,
    localDate,
    tzOffsetMinutes: 0,
    pausedSeconds: 0,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
  const exercise: WorkoutExercise = {
    id: `exercise-${id}`,
    workoutId: workout.id,
    exerciseId: config.exerciseId ?? "bench",
    order: 0,
    exerciseNameSnapshot: config.exerciseName ?? "Bench Press",
    primaryMuscleGroupSnapshot: "chest",
    secondaryMuscleGroupsSnapshot: ["triceps"],
    equipmentSnapshot: "barbell",
    trackingTypeSnapshot: "weight_reps",
    restSeconds: 120,
  };

  const sets: WorkoutSet[] = [];
  const add = (count: number, setType: SetType) => {
    for (let index = 0; index < count; index += 1) {
      sets.push({
        id: `set-${id}-${setType}-${index}`,
        workoutId: workout.id,
        workoutExerciseId: exercise.id,
        order: sets.length,
        setType,
        weightG: config.weightG ?? 100_000,
        reps: config.reps ?? 5,
        isCompleted: true,
        completedAt: startedAt,
      });
    }
  };

  add(config.hardSets ?? 1, "working");
  add(config.warmups ?? 0, "warmup");
  add(config.drops ?? 0, "drop");
  add(config.failures ?? 0, "failure");
  return { workout, exercise, sets };
}

function baseline(hardSets = 10): LoggedEntry[] {
  return [
    entry("2026-08-10", "b1", { hardSets }),
    entry("2026-08-17", "b2", { hardSets }),
    entry("2026-08-24", "b3", { hardSets }),
    entry("2026-08-31", "b4", { hardSets }),
  ];
}

describe("weeklyVerdict v1", () => {
  const reference = new Date("2026-09-17T12:00:00.000Z");

  it("judges the last completed week, not the partial current week", () => {
    const result = weeklyVerdict(
      [
        ...baseline(10),
        entry("2026-09-08", "last", { hardSets: 12 }),
        entry("2026-09-15", "current", { hardSets: 2 }),
      ],
      options,
      "monday",
      reference,
    );

    expect(result.subject.startDate).toBe("2026-09-07");
    expect(result.subject.metrics.hardSets).toBe(12);
    expect(result.direction?.band).toBe("up");
    expect(result.direction?.changePercent).toBe(20);
  });

  it("unlocks with three baseline training weeks and says so", () => {
    const result = weeklyVerdict(
      [
        entry("2026-08-17", "b1", { hardSets: 10 }),
        entry("2026-08-24", "b2", { hardSets: 10 }),
        entry("2026-08-31", "b3", { hardSets: 10 }),
        entry("2026-09-08", "last", { hardSets: 10 }),
      ],
      options,
      "monday",
      reference,
    );

    expect(result.state).toBe("full");
    expect(result.baseline.weeks).toHaveLength(3);
    expect(weeklyVerdictCopy(result, "kg").baselineLabel).toBe("Based on 3 weeks");
  });

  it("withholds the verdict below three baseline training weeks", () => {
    const result = weeklyVerdict(
      [
        entry("2026-08-24", "b1", { hardSets: 10 }),
        entry("2026-08-31", "b2", { hardSets: 10 }),
        entry("2026-09-08", "last", { hardSets: 10 }),
      ],
      options,
      "monday",
      reference,
    );

    expect(result.state).toBe("not_enough_history");
    expect(weeklyVerdictCopy(result, "kg").available).toBe(false);
  });

  it("counts completed working sets only as hard sets", () => {
    const result = weeklyVerdict(
      [
        ...baseline(1),
        entry("2026-09-08", "last", { hardSets: 2, warmups: 4, drops: 3, failures: 2 }),
      ],
      options,
      "monday",
      reference,
    );

    expect(result.subject.metrics.hardSets).toBe(2);
  });

  it("shows a welcome-back state after two immediately preceding empty weeks", () => {
    const result = weeklyVerdict(
      [
        entry("2026-08-03", "old1", { hardSets: 8 }),
        entry("2026-08-10", "old2", { hardSets: 8 }),
        entry("2026-08-17", "old3", { hardSets: 8 }),
        entry("2026-09-08", "return", { hardSets: 8 }),
      ],
      options,
      "monday",
      reference,
    );

    expect(result.state).toBe("welcome_back");
    expect(weeklyVerdictCopy(result, "kg").lines[0]?.plain).toContain("Welcome back");
  });

  it("recognises a deload-shaped week when hard sets fall but sessions hold", () => {
    const entries = baseline(10).flatMap((row, index) => [
      row,
      entry(row.workout.localDate, `b-extra-${index}`, { hardSets: 1 }),
    ]);
    const result = weeklyVerdict(
      [
        ...entries,
        entry("2026-09-08", "last-a", { hardSets: 3 }),
        entry("2026-09-11", "last-b", { hardSets: 2 }),
      ],
      options,
      "monday",
      reference,
    );

    expect(result.state).toBe("deload");
    expect(weeklyVerdictCopy(result, "kg").lines[0]?.plain).toContain("looks like a deload");
  });

  it("uses a new e1RM best as the first standout rule", () => {
    const result = weeklyVerdict(
      [...baseline(4), entry("2026-09-08", "last", { hardSets: 4, weightG: 110_000, reps: 5 })],
      options,
      "monday",
      reference,
    );

    expect(result.standout?.id).toBe("standout_new_e1rm_best");
    expect(weeklyVerdictCopy(result, "kg").lines[1]?.plain).toContain(
      "Bench Press hit a new best estimate",
    );
  });

  it("follows a chosen goal lift instead of the most-frequent one", () => {
    const entries: LoggedEntry[] = [];
    for (const week of ["2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"]) {
      entries.push(entry(week, `bench-${week}`, { hardSets: 3 }));
      entries.push(
        entry(week, `row-${week}`, { exerciseId: "row", exerciseName: "Barbell Row", hardSets: 3 }),
      );
      entries.push(
        entry(week, `curl-${week}`, {
          exerciseId: "curl",
          exerciseName: "Barbell Curl",
          hardSets: 3,
        }),
      );
    }
    // Squat is trained only once in the baseline — excluded from the inferred top 3.
    entries.push(
      entry("2026-08-10", "squat-base", {
        exerciseId: "squat",
        exerciseName: "Back Squat",
        hardSets: 3,
        weightG: 100_000,
        reps: 5,
      }),
    );
    // Subject week: a new best on squat, and nothing else logged.
    entries.push(
      entry("2026-09-08", "squat-last", {
        exerciseId: "squat",
        exerciseName: "Back Squat",
        hardSets: 3,
        weightG: 150_000,
        reps: 5,
      }),
    );

    const inferred = weeklyVerdict(entries, options, "monday", reference);
    expect(inferred.goalLiftSource).toBe("inferred");
    expect(inferred.goalLifts.map((lift) => lift.id)).not.toContain("squat");
    expect(inferred.standout?.id).not.toBe("standout_new_e1rm_best");

    const chosen = weeklyVerdict(entries, options, "monday", reference, ["squat"]);
    expect(chosen.goalLiftSource).toBe("chosen");
    expect(chosen.standout?.id).toBe("standout_new_e1rm_best");
    expect(chosen.standout?.text).toContain("Back Squat");
  });

  it("uses the sessions drop as a watch-out when hard sets are otherwise steady", () => {
    const entries: LoggedEntry[] = [];
    for (const [week, prefix] of [
      ["2026-08-10", "a"],
      ["2026-08-17", "b"],
      ["2026-08-24", "c"],
      ["2026-08-31", "d"],
    ] as const) {
      entries.push(entry(week, `${prefix}1`, { hardSets: 5 }));
      const second = new Date(`${week}T00:00:00.000Z`);
      second.setUTCDate(second.getUTCDate() + 3);
      entries.push(entry(second.toISOString().slice(0, 10), `${prefix}2`, { hardSets: 5 }));
    }
    entries.push(entry("2026-09-08", "last", { hardSets: 10 }));

    const result = weeklyVerdict(entries, options, "monday", reference);
    expect(result.direction?.band).toBe("steady");
    expect(result.watchout?.id).toBe("watchout_sessions_down");
  });

  it("compares the current pulse with the same elapsed span, never full prior weeks", () => {
    const entries: LoggedEntry[] = [];
    for (const [week, prefix] of [
      ["2026-08-17", "a"],
      ["2026-08-24", "b"],
      ["2026-08-31", "c"],
      ["2026-09-07", "d"],
    ] as const) {
      entries.push(entry(week, `${prefix}-early`, { hardSets: 2 }));
      const late = new Date(`${week}T00:00:00.000Z`);
      late.setUTCDate(late.getUTCDate() + 4);
      entries.push(entry(late.toISOString().slice(0, 10), `${prefix}-late`, { hardSets: 8 }));
    }
    entries.push(entry("2026-09-14", "current", { hardSets: 2 }));

    const result = weeklyVerdict(entries, options, "monday", new Date("2026-09-15T12:00:00.000Z"));

    expect(result.pulse?.currentHardSets).toBe(2);
    expect(result.pulse?.baselineHardSetsAverage).toBe(2);
    expect(result.pulse?.changePercent).toBe(0);
  });

  it("hides the pulse on day one of the training week", () => {
    const result = weeklyVerdict(
      [
        ...baseline(10),
        entry("2026-09-08", "last", { hardSets: 10 }),
        entry("2026-09-14", "current", { hardSets: 2 }),
      ],
      options,
      "monday",
      new Date("2026-09-14T12:00:00.000Z"),
    );

    expect(result.pulse).toBeNull();
  });
});

describe("Goal Lenses v1", () => {
  const reference = new Date("2026-09-17T12:00:00.000Z");

  function deloadEntriesHeld() {
    return baseline(10).flatMap((row, index) => [
      row,
      entry(row.workout.localDate, `b-extra-${index}`, { hardSets: 1 }),
    ]);
  }

  it("default (omitted) goalLens is byte-identical to build — deload copy unchanged", () => {
    const entries = [
      ...deloadEntriesHeld(),
      entry("2026-09-08", "last-a", { hardSets: 3 }),
      entry("2026-09-11", "last-b", { hardSets: 2 }),
    ];
    const withoutLens = weeklyVerdict(entries, options, "monday", reference);
    const explicitBuild = weeklyVerdict(entries, options, "monday", reference, undefined, "build");

    expect(withoutLens.state).toBe("deload");
    expect(withoutLens.goalLens).toBe("build");
    expect(withoutLens).toEqual(explicitBuild);

    const copy = weeklyVerdictCopy(withoutLens, "kg");
    expect(copy.lines[0]?.plain).toContain("looks like a deload");
    expect(copy.lines[0]?.plain).not.toContain("intensity block");
  });

  it("computes intensityHeld regardless of the active lens (derived-on-read)", () => {
    const entries = [
      ...deloadEntriesHeld(),
      entry("2026-09-08", "last-a", { hardSets: 3 }),
      entry("2026-09-11", "last-b", { hardSets: 2 }),
    ];
    const buildResult = weeklyVerdict(entries, options, "monday", reference);
    const strengthResult = weeklyVerdict(
      entries,
      options,
      "monday",
      reference,
      undefined,
      "strength",
    );

    expect(buildResult.state).toBe("deload");
    expect(buildResult.intensityHeld).toBe(true);
    expect(strengthResult.intensityHeld).toBe(true);
  });

  it('Strength + deload-shape + e1RM held reads as "Intensity block"', () => {
    const entries = [
      ...deloadEntriesHeld(),
      entry("2026-09-08", "last-a", { hardSets: 3 }),
      entry("2026-09-11", "last-b", { hardSets: 2 }),
    ];
    const result = weeklyVerdict(entries, options, "monday", reference, undefined, "strength");

    expect(result.state).toBe("deload");
    expect(result.intensityHeld).toBe(true);
    const copy = weeklyVerdictCopy(result, "kg", undefined, "strength");
    expect(copy.lines[0]?.plain.toLowerCase()).toContain("intensity block");
    expect(copy.lines[0]?.plain.toLowerCase()).toContain("lighter week");
  });

  it("Strength + deload-shape + e1RM down falls through to today's Deload copy unchanged", () => {
    const entries = [
      ...deloadEntriesHeld(),
      entry("2026-09-08", "last-a", { hardSets: 3, weightG: 60_000 }),
      entry("2026-09-11", "last-b", { hardSets: 2, weightG: 60_000 }),
    ];
    const result = weeklyVerdict(entries, options, "monday", reference, undefined, "strength");

    expect(result.state).toBe("deload");
    expect(result.intensityHeld).toBe(false);
    const copy = weeklyVerdictCopy(result, "kg", undefined, "strength");
    expect(copy.lines[0]?.plain).toBe("Lighter week, consistent sessions — looks like a deload.");
  });

  it('Maintain + deload-shape drops the "deload" jargon regardless of e1RM', () => {
    const entries = [
      ...deloadEntriesHeld(),
      entry("2026-09-08", "last-a", { hardSets: 3, weightG: 60_000 }),
      entry("2026-09-11", "last-b", { hardSets: 2, weightG: 60_000 }),
    ];
    const result = weeklyVerdict(entries, options, "monday", reference, undefined, "maintain");
    const copy = weeklyVerdictCopy(result, "kg", undefined, "maintain");

    expect(copy.lines[0]?.plain).not.toContain("deload");
    expect(copy.lines[0]?.plain).toContain("Lighter week");
  });

  it("Build + deload-shape stays identical whether or not e1RM held", () => {
    const held = [
      ...deloadEntriesHeld(),
      entry("2026-09-08", "last-a", { hardSets: 3 }),
      entry("2026-09-11", "last-b", { hardSets: 2 }),
    ];
    const down = [
      ...deloadEntriesHeld(),
      entry("2026-09-08", "last-a", { hardSets: 3, weightG: 60_000 }),
      entry("2026-09-11", "last-b", { hardSets: 2, weightG: 60_000 }),
    ];
    const heldCopy = weeklyVerdictCopy(
      weeklyVerdict(held, options, "monday", reference, undefined, "build"),
      "kg",
    );
    const downCopy = weeklyVerdictCopy(
      weeklyVerdict(down, options, "monday", reference, undefined, "build"),
      "kg",
    );

    expect(heldCopy.lines[0]?.plain).toBe(
      "Lighter week, consistent sessions — looks like a deload.",
    );
    expect(downCopy.lines[0]?.plain).toBe(
      "Lighter week, consistent sessions — looks like a deload.",
    );
  });

  it("Maintain mutes a -10% to -30% direction band to neutral tone, pct still evidenced", () => {
    const result = weeklyVerdict(
      [...baseline(10), entry("2026-09-08", "last", { hardSets: 8 })],
      options,
      "monday",
      reference,
    );

    expect(result.state).toBe("full");
    expect(result.direction?.band).toBe("down");
    expect(result.direction?.changePercent).toBe(-20);

    const maintainCopy = weeklyVerdictCopy(result, "kg", undefined, "maintain");
    expect(maintainCopy.lines[0]?.plain).toContain("holding within your usual range");
    expect(maintainCopy.lines[0]?.plain).toContain("20%");
    expect(
      maintainCopy.lines[0]?.parts.some((part) => part.evidenceKey === "direction_change"),
    ).toBe(true);

    const buildCopy = weeklyVerdictCopy(result, "kg");
    expect(buildCopy.lines[0]?.plain).not.toContain("holding within your usual range");
  });

  it("Maintain stays attention-worthy beyond -30% (well_down) — no neutral reframe", () => {
    const result = weeklyVerdict(
      [...baseline(10), entry("2026-09-08", "last", { hardSets: 7 })],
      options,
      "monday",
      reference,
    );

    expect(result.state).toBe("full");
    expect(result.direction?.band).toBe("well_down");

    const maintainCopy = weeklyVerdictCopy(result, "kg", undefined, "maintain");
    const buildCopy = weeklyVerdictCopy(result, "kg");
    expect(maintainCopy.lines[0]?.plain).not.toContain("holding within your usual range");
    expect(maintainCopy.lines[0]?.plain).toBe(buildCopy.lines[0]?.plain);
  });
});
