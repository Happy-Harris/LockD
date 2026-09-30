import { describe, expect, it } from "vitest";
import type { Exercise } from "@/domain/types";
import { importProgramFile } from "@/lib/gym/programs";
import { buildProgramFromText, parseProgramText, programTextNames } from "./program-text";

const exercise = (id: string, name: string): Exercise =>
  ({ id, name, primaryMuscle: "chest", equipment: "barbell", isCustom: false }) as unknown as Exercise;

const LIBRARY = [
  exercise("bench", "Bench Press"),
  exercise("squat", "Squat"),
  exercise("close-grip", "Close-Grip Bench Press"),
];
const DEFAULTS = { lens: "general" as const, restSeconds: 120, incrementG: 2500 };

const TEXT = `Upper Lower 4 day
# a comment that is not reported

Week 1
Day 1: Upper
Bench Press 3x8-12 @ RPE 8 rest 90s
Squat 4 sets of 6
Day 2
- Bench Press 5 x 5 | pause the first rep
`;

describe("program text: the grammar", () => {
  const parsed = parseProgramText(TEXT);

  it("reads the name, the week, the sessions and every exercise line", () => {
    expect(parsed.name).toBe("Upper Lower 4 day");
    expect(parsed.weeks).toEqual([{ weekNumber: 1, isDeload: false }]);
    expect(parsed.sessions.map((s) => s.name)).toEqual(["Upper", "Day 2"]);
    const [bench, squat] = parsed.sessions[0].exercises;
    expect(bench).toMatchObject({ name: "Bench Press", sets: 3, repMin: 8, repMax: 12, rpe: 8, restSeconds: 90 });
    expect(squat).toMatchObject({ name: "Squat", sets: 4, repMin: 6, repMax: 6 });
    expect(parsed.sessions[1].exercises[0]).toMatchObject({ sets: 5, repMin: 5, repMax: 5, notes: "pause the first rep" });
  });

  it("reports nothing for comments and blank lines", () => {
    expect(parsed.unused).toEqual([]);
  });

  it("is deterministic: the same text gives the same result", () => {
    expect(parseProgramText(TEXT)).toEqual(parsed);
  });

  it("reads rest as seconds, a clock or minutes, and @8 as RPE", () => {
    const rows = parseProgramText("Day 1\nA Lift 3x5 rest 2:30\nB Lift 3x5 rest 2 min @8\nC Lift 3x5 rest 45").sessions[0].exercises;
    expect(rows.map((r) => r.restSeconds)).toEqual([150, 120, 45]);
    expect(rows[1].rpe).toBe(8);
  });

  it("accepts tabs from a pasted spreadsheet as spaces", () => {
    const rows = parseProgramText("Day 1\nBench Press\t3x8").sessions[0].exercises;
    expect(rows[0]).toMatchObject({ name: "Bench Press", sets: 3, repMin: 8 });
  });
});

describe("program text: nothing is dropped without a row in the unused list", () => {
  it("lists a line with no sets and reps, with its line number and the reason", () => {
    const { unused } = parseProgramText("Day 1\nBench Press 3x8\nFoam roll for a while");
    expect(unused).toEqual([
      { line: 3, text: "Foam roll for a while", reason: "no sets and reps found (write it like 3x8 or 3x8-12)" },
    ]);
  });

  it("keeps a load in the row's notes and lists it as not used", () => {
    const parsed = parseProgramText("Day 1\nBench Press 3x5 @ 100 kg\nSquat 5x5 @ 80%");
    expect(parsed.sessions[0].exercises.map((r) => r.notes)).toEqual(["@ 100 kg", "@ 80%"]);
    expect(parsed.unused.map((u) => [u.line, u.text])).toEqual([
      [2, "@ 100 kg"],
      [3, "@ 80%"],
    ]);
    expect(parsed.unused[0].reason).toMatch(/loads are not stored/);
  });

  it("lists supersets instead of guessing", () => {
    const { unused, sessions } = parseProgramText("Day 1\nA1. Bench Press 3x8\nA2. Row 3x8");
    expect(unused.map((u) => u.line)).toEqual([2, 3]);
    expect(unused[0].reason).toMatch(/supersets/);
    expect(sessions).toEqual([]);
  });

  it("lists text after the sets and reps that is not a note", () => {
    const { unused, sessions } = parseProgramText("Day 1\nBench Press 3x8 (paused)");
    expect(sessions[0].exercises[0].name).toBe("Bench Press");
    expect(unused).toEqual([{ line: 2, text: "(paused)", reason: "not part of the grammar, so it was left out" }]);
  });

  it("lists impossible values", () => {
    const { unused } = parseProgramText("Day 1\nBench Press 0x8\nSquat 3x12-8\nRow 3x8 @ RPE 11");
    expect(unused.map((u) => u.reason)).toEqual([
      "sets must be at least 1",
      "the rep range is not a valid range",
      "RPE must be between 1 and 10",
    ]);
  });

  it("lists a name-less line", () => {
    expect(parseProgramText("Day 1\n3x8").unused[0].reason).toMatch(/no exercise name/);
  });
});

describe("program text: weeks", () => {
  it("counts weeks that repeat the first, and marks a deload", () => {
    const parsed = parseProgramText("Week 1\nDay 1\nBench Press 3x8\nWeek 2\nDay 1\nBench Press 3x8\nWeek 3: deload\nDay 1\nBench Press 3x8");
    expect(parsed.weeks).toEqual([
      { weekNumber: 1, isDeload: false },
      { weekNumber: 2, isDeload: false },
      { weekNumber: 3, isDeload: true },
    ]);
    expect(parsed.unused).toEqual([]);
  });

  it("lists the lines of a week that differs, and keeps the first week as the program", () => {
    const parsed = parseProgramText("Week 1\nDay 1\nBench Press 3x8\nWeek 2\nDay 1\nBench Press 4x6");
    expect(parsed.sessions[0].exercises[0].sets).toBe(3);
    expect(parsed.unused).toEqual([
      { line: 6, text: "Bench Press 4x6", reason: "differs from Week 1; a program repeats the same sessions every week" },
    ]);
  });
});

describe("program text: the file it builds", () => {
  it("builds a lockd-program v1 file with the defaults labelled as filled in", () => {
    const built = buildProgramFromText(parseProgramText(TEXT), LIBRARY, DEFAULTS, new Map(), "2026-09-30T00:00:00.000Z");
    const { file, filledIn } = built;
    expect(file.format).toBe("lockd-program");
    expect(file.version).toBe(1);
    expect(file.program).toMatchObject({ name: "Upper Lower 4 day", lens: "general", weekCount: 1 });
    const squat = file.sessions[0].exercises[1];
    expect(squat).toMatchObject({
      exerciseId: "squat",
      restSeconds: 120,
      includeWarmup: true,
      rule: { kind: "double_progression", incrementG: 2500 },
    });
    expect(file.sessions[0].exercises[0].restSeconds).toBe(90);
    expect(filledIn.map((f) => f.field)).toEqual(["Rest between sets", "Progression", "Warm-up sets", "Goal lens"]);
  });

  it("fills in the name, the weeks and the session name when the text has none", () => {
    const { file, filledIn } = buildProgramFromText(parseProgramText("Bench Press 3x8"), LIBRARY, DEFAULTS);
    expect(file.program.name).toBe("Program from text");
    expect(file.weeks).toEqual([{ weekNumber: 1, isDeload: false }]);
    expect(file.sessions[0].name).toBe("Day 1");
    expect(filledIn.map((f) => f.field)).toEqual(
      expect.arrayContaining(["Program name", "Weeks", "Session name"]),
    );
  });

  it("links exact names, offers near names, and keeps new names as unresolved rows", () => {
    const parsed = parseProgramText("Day 1\nbench press 3x8\nBench Press - Close Grip 3x8\nCable Fly 3x12");
    const { step } = programTextNames(parsed, LIBRARY);
    expect(step.matched).toEqual(["bench press"]);
    expect(step.candidates.map((c) => [c.name, c.exercise.id])).toEqual([["Bench Press - Close Grip", "close-grip"]]);
    expect(step.fresh).toEqual(["Cable Fly"]);

    const { file } = buildProgramFromText(parsed, LIBRARY, DEFAULTS);
    const [exact, near, fresh] = file.sessions[0].exercises;
    expect(exact.exerciseId).toBe("bench");
    expect(near.exerciseId).toBe(""); // not linked until a person accepts it
    const installed = importProgramFile(file, "2026-09-30T00:00:00.000Z", LIBRARY);
    expect(installed.exercises.map((r) => r.unresolvedName)).toEqual([undefined, "Bench Press - Close Grip", "Cable Fly"]);
    expect(fresh.exerciseName).toBe("Cable Fly");

    const accepted = buildProgramFromText(parsed, LIBRARY, DEFAULTS, new Map([["bench press close grip", "close-grip"]]));
    expect(accepted.file.sessions[0].exercises[1]).toMatchObject({ exerciseId: "close-grip", exerciseName: "Close-Grip Bench Press" });
  });

  it("goes through the existing program import unchanged", () => {
    const { file } = buildProgramFromText(parseProgramText(TEXT), LIBRARY, DEFAULTS);
    const installed = importProgramFile(file, "2026-09-30T00:00:00.000Z", LIBRARY);
    expect(installed.program.origin).toBe("custom");
    expect(installed.sessions.map((s) => s.name)).toEqual(["Upper", "Day 2"]);
    expect(installed.exercises).toHaveLength(3);
    expect(installed.exercises.every((r) => r.unresolvedName === undefined)).toBe(true);
  });
});
