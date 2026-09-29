import { describe, expect, it } from "vitest";
import type { SetType, Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import { EXPLORE_BADGE, answerAskLab, detectMuscleInQuery, type AskLabContext } from "./askLab";
import type { LoggedEntry } from "./compute";

let id = 0;

function entry({
  date,
  primary = "chest",
  secondary = ["triceps"] as const,
  setTypes = ["working"] as SetType[],
  completed = true,
  exerciseId = "bench",
  exerciseName = "Bench Press",
  weightG = 100_000,
  reps = 5,
}: {
  date: string;
  primary?: WorkoutExercise["primaryMuscleGroupSnapshot"];
  secondary?: WorkoutExercise["secondaryMuscleGroupsSnapshot"];
  setTypes?: SetType[];
  completed?: boolean;
  exerciseId?: string;
  exerciseName?: string;
  weightG?: number;
  reps?: number;
}): LoggedEntry {
  id += 1;
  const suffix = String(id);
  const workout: Workout = {
    id: `workout-${suffix}`,
    name: "Session",
    status: "completed",
    startedAt: `${date}T10:00:00.000Z`,
    endedAt: `${date}T11:00:00.000Z`,
    localDate: date,
    tzOffsetMinutes: 0,
    pausedSeconds: 0,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T11:00:00.000Z`,
  };
  const exercise: WorkoutExercise = {
    id: `workout-exercise-${suffix}`,
    workoutId: workout.id,
    exerciseId,
    order: 0,
    exerciseNameSnapshot: exerciseName,
    primaryMuscleGroupSnapshot: primary,
    secondaryMuscleGroupsSnapshot: [...secondary],
    equipmentSnapshot: "barbell",
    trackingTypeSnapshot: "weight_reps",
    restSeconds: 120,
  };
  const sets: WorkoutSet[] = setTypes.map((setType, index) => ({
    id: `set-${suffix}-${index}`,
    workoutId: workout.id,
    workoutExerciseId: exercise.id,
    order: index,
    setType,
    weightG,
    reps,
    isCompleted: completed,
    completedAt: completed ? `${date}T10:30:00.000Z` : undefined,
  }));
  return { workout, exercise, sets };
}

function context(
  entries: LoggedEntry[],
  reference = new Date("2026-09-17T12:00:00Z"),
): AskLabContext {
  return {
    entries,
    weekStart: "monday",
    secondaryCredit: 0.5,
    formula: "epley",
    includeWarmups: false,
    weightUnit: "kg",
    reference,
  };
}

describe("answerAskLab catalog path", () => {
  it("maps the 10–20 band question to the default-band claim", () => {
    const answer = answerAskLab("Why is the default 10–20 credited sets?");
    expect(answer.tier).toBe("computed");
    expect(answer.intent).toBeNull();
    expect(answer.matches[0]?.claim.id).toBe("weekly-credited-sets-10-20");
    expect(answer.matches[0]?.claim.kind).toBe("implementation_heuristic");
  });

  it("labels secondary credit as a heuristic", () => {
    const answer = answerAskLab("Why do secondary muscles get 0.5 credit?");
    expect(answer.tier).toBe("computed");
    expect(answer.matches[0]?.claim.id).toBe("secondary-set-credit-default");
    expect(answer.matches[0]?.claim.kind).toBe("implementation_heuristic");
  });

  it("resolves e1RM formula questions to pure calculation", () => {
    const answer = answerAskLab("How is estimated 1RM calculated with Epley?");
    expect(answer.tier).toBe("computed");
    expect(answer.matches.some((row) => row.claim.id === "e1rm-formulas")).toBe(true);
  });

  it("uses Explore tier for out-of-domain questions without inventing sources", () => {
    const answer = answerAskLab("Should I take creatine on rest days?");
    expect(answer.tier).toBe("explore");
    expect(answer.matches).toHaveLength(0);
    expect(answer.call).toBe(EXPLORE_BADGE);
  });
});

describe("answerAskLab data intents", () => {
  it("computes training_enough from credited sets vs targets", () => {
    const answer = answerAskLab(
      "Am I training enough?",
      context([
        entry({ date: "2026-09-15", setTypes: ["working", "working", "working"] }),
        entry({
          date: "2026-09-16",
          primary: "back",
          secondary: ["biceps"],
          exerciseId: "row",
          exerciseName: "Barbell Row",
          setTypes: ["working", "working"],
        }),
      ]),
    );
    expect(answer.intent).toBe("training_enough");
    expect(answer.tier).toBe("computed");
    expect(answer.payload?.kind).toBe("training_enough");
    if (answer.payload?.kind !== "training_enough") return;
    expect(answer.payload.weekStartDate).toBe("2026-09-14");
    expect(answer.payload.muscles.some((row) => row.muscle === "chest" && row.sets === 3)).toBe(
      true,
    );
    expect(answer.payload.evidence.length).toBeGreaterThan(0);
    expect(answer.matches.some((row) => row.claim.id === "weekly-credited-sets-10-20")).toBe(true);
  });

  it("returns Partial for muscle_contribution without a muscle", () => {
    const answer = answerAskLab(
      "Which exercises contributed?",
      context([entry({ date: "2026-09-15" })]),
    );
    expect(answer.intent).toBe("muscle_contribution");
    expect(answer.tier).toBe("partial");
    expect(answer.missing?.toLowerCase()).toContain("muscle");
    expect(answer.nextStep).toBeTruthy();
  });

  it("attributes muscle_contribution rows for a named muscle", () => {
    const answer = answerAskLab(
      "Which exercises contributed to chest?",
      context([
        entry({ date: "2026-09-15", setTypes: ["working", "working"] }),
        entry({
          date: "2026-09-16",
          primary: "shoulders",
          secondary: ["chest"],
          exerciseId: "ohp",
          exerciseName: "Overhead Press",
          setTypes: ["working"],
        }),
      ]),
    );
    expect(answer.intent).toBe("muscle_contribution");
    expect(answer.tier).toBe("computed");
    expect(answer.payload?.kind).toBe("muscle_contribution");
    if (answer.payload?.kind !== "muscle_contribution") return;
    expect(answer.payload.muscle).toBe("chest");
    expect(answer.payload.attributions.map((row) => row.exerciseName).sort()).toEqual([
      "Bench Press",
      "Overhead Press",
    ]);
  });

  it("imports weeklyVerdict for verdict_why without a second engine", () => {
    const baseline = [
      entry({ date: "2026-08-10", setTypes: Array(10).fill("working") as SetType[] }),
      entry({ date: "2026-08-17", setTypes: Array(10).fill("working") as SetType[] }),
      entry({ date: "2026-08-24", setTypes: Array(10).fill("working") as SetType[] }),
      entry({ date: "2026-08-31", setTypes: Array(10).fill("working") as SetType[] }),
      entry({ date: "2026-09-08", setTypes: Array(12).fill("working") as SetType[] }),
    ];
    const answer = answerAskLab(
      "Why did Weekly Verdict change?",
      context(baseline, new Date("2026-09-17T12:00:00Z")),
    );
    expect(answer.intent).toBe("verdict_why");
    expect(answer.tier).toBe("computed");
    expect(answer.payload?.kind).toBe("verdict_why");
    if (answer.payload?.kind !== "verdict_why") return;
    expect(answer.payload.weekStart).toBe("monday");
    expect(answer.payload.verdict.state).toBe("full");
    expect(answer.payload.subjectStartDate).toBe(answer.payload.verdict.subject.startDate);
    expect(answer.payload.copy.available).toBe(true);
  });

  it("returns Partial for verdict_why when history is insufficient", () => {
    const answer = answerAskLab(
      "Why did Weekly Verdict change?",
      context([entry({ date: "2026-09-08" })], new Date("2026-09-17T12:00:00Z")),
    );
    expect(answer.intent).toBe("verdict_why");
    expect(answer.tier).toBe("partial");
    expect(answer.payload?.kind).toBe("verdict_why");
    if (answer.payload?.kind !== "verdict_why") return;
    expect(answer.payload.verdict.state).toBe("not_enough_history");
    expect(answer.payload.copy.available).toBe(false);
    expect(answer.nextStep).toBeTruthy();
  });

  it("computes getting_stronger e1RM trends with a clear window and rep-cap claim", () => {
    const answer = answerAskLab(
      "Am I getting stronger?",
      context(
        [
          entry({
            date: "2026-07-01",
            weightG: 80_000,
            reps: 5,
            setTypes: ["working"],
          }),
          entry({
            date: "2026-08-15",
            weightG: 90_000,
            reps: 5,
            setTypes: ["working"],
          }),
          entry({
            date: "2026-09-10",
            weightG: 100_000,
            reps: 5,
            setTypes: ["working"],
          }),
        ],
        new Date("2026-09-17T12:00:00Z"),
      ),
    );
    expect(answer.intent).toBe("getting_stronger");
    expect(answer.tier).toBe("computed");
    expect(answer.payload?.kind).toBe("getting_stronger");
    if (answer.payload?.kind !== "getting_stronger") return;
    expect(answer.payload.windowKey).toBe("12w");
    expect(answer.payload.repCap).toBe(12);
    expect(answer.payload.trends.length).toBeGreaterThan(0);
    expect(answer.matches.some((row) => row.claim.id === "e1rm-rep-cap-12")).toBe(true);
    expect(answer.call.toLowerCase()).not.toMatch(/aura|mog|beast|warrior|bro/);
  });

  it("returns Partial for getting_stronger with insufficient history", () => {
    const answer = answerAskLab(
      "Am I getting stronger?",
      context([entry({ date: "2026-09-10" })], new Date("2026-09-17T12:00:00Z")),
    );
    expect(answer.intent).toBe("getting_stronger");
    expect(answer.tier).toBe("partial");
    expect(answer.missing).toBeTruthy();
    expect(answer.nextStep).toBeTruthy();
  });

  it("routes What should I change? to change_flags and never invents a program", () => {
    const entries = [
      entry({ date: "2026-08-10", setTypes: Array(10).fill("working") as SetType[] }),
      entry({ date: "2026-08-17", setTypes: Array(10).fill("working") as SetType[] }),
      entry({ date: "2026-08-24", setTypes: Array(10).fill("working") as SetType[] }),
      entry({ date: "2026-08-31", setTypes: Array(10).fill("working") as SetType[] }),
      entry({ date: "2026-09-08", setTypes: Array(10).fill("working") as SetType[] }),
    ];
    const answer = answerAskLab("What should I change?", context(entries));
    expect(answer.intent).toBe("change_flags");
    expect(["computed", "partial"]).toContain(answer.tier);
    expect(answer.payload?.kind).toBe("change_flags");
    expect(answer.call.toLowerCase()).not.toMatch(/program|mesocycle|aura|cheer/);
    expect(answer.call.toLowerCase()).not.toMatch(/you should do|prescribe/);
  });

  it("returns Partial instead of a false no-flags call without a weekly baseline", () => {
    const answer = answerAskLab("What should I change?", context([entry({ date: "2026-09-10" })]));

    expect(answer.intent).toBe("change_flags");
    expect(answer.tier).toBe("partial");
    expect(answer.call).toMatch(/more comparable training history/i);
    expect(answer.call).not.toMatch(/^No stall/i);
    expect(answer.payload?.kind).toBe("change_flags");
    if (answer.payload?.kind !== "change_flags") return;
    expect(answer.payload.hasPartialChecks).toBe(true);
  });
});

describe("detectMuscleInQuery", () => {
  it("finds muscle names and aliases", () => {
    expect(detectMuscleInQuery("contributed to chest")).toBe("chest");
    expect(detectMuscleInQuery("hit my abs")).toBe("core");
  });
});

describe("verdict weekStart alignment", () => {
  it("does not invent a second verdict engine or flip full vs partial week semantics", () => {
    const entries = [
      entry({ date: "2026-08-10", setTypes: Array(10).fill("working") as SetType[] }),
      entry({ date: "2026-08-17", setTypes: Array(10).fill("working") as SetType[] }),
      entry({ date: "2026-08-24", setTypes: Array(10).fill("working") as SetType[] }),
      entry({ date: "2026-08-31", setTypes: Array(10).fill("working") as SetType[] }),
      entry({ date: "2026-09-08", setTypes: Array(10).fill("working") as SetType[] }),
    ];
    const sunday = answerAskLab("Why did Weekly Verdict change?", {
      ...context(entries),
      weekStart: "sunday",
    });
    const monday = answerAskLab("Why did Weekly Verdict change?", {
      ...context(entries),
      weekStart: "monday",
    });
    expect(sunday.payload?.kind).toBe("verdict_why");
    expect(monday.payload?.kind).toBe("verdict_why");
    if (sunday.payload?.kind !== "verdict_why" || monday.payload?.kind !== "verdict_why") return;
    expect(sunday.payload.weekStart).toBe("sunday");
    expect(monday.payload.weekStart).toBe("monday");
    expect(sunday.payload.verdict.subject.startDate).not.toBe(
      monday.payload.verdict.subject.startDate,
    );
  });
});
