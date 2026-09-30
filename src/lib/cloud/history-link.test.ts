import { describe, expect, it } from "vitest";
import type { CloudGym } from "./types";
import { HISTORY_TOKEN_PATTERN, historyView, newHistoryToken } from "./history-link";

/** Opp 9: the read-only link shows completed sessions and their completed sets, and nothing else from the vault. */
const workout = (id: string, date: string, status = "completed", extra: Record<string, unknown> = {}) => ({
  id,
  name: `Session ${date}`,
  status,
  localDate: date,
  startedAt: `${date}T10:00:00Z`,
  endedAt: `${date}T11:00:00Z`,
  pausedSeconds: 300,
  notes: "private note about my knee",
  ...extra,
});

export const vault = {
  exercises: [],
  templates: [],
  templateExercises: [],
  workouts: [
    workout("w1", "2026-01-05"),
    workout("w2", "2026-01-08"),
    workout("w3", "2026-01-10", "active"),
    workout("w4", "2026-01-12", "discarded"),
  ],
  workoutExercises: [
    { id: "e1", workoutId: "w1", exerciseId: "bench", order: 0, exerciseNameSnapshot: "Bench Press", notes: "elbow" },
    { id: "e2", workoutId: "w2", exerciseId: "squat", order: 1, exerciseNameSnapshot: "Back Squat" },
    { id: "e3", workoutId: "w2", exerciseId: "bench", order: 0, exerciseNameSnapshot: "Bench Press" },
  ],
  workoutSets: [
    { id: "s1", workoutId: "w1", workoutExerciseId: "e1", order: 1, setType: "working", weightG: 100_000, reps: 5, isCompleted: true, notes: "grindy", clipId: "clip-1" },
    { id: "s0", workoutId: "w1", workoutExerciseId: "e1", order: 0, setType: "warmup", weightG: 60_000, reps: 8, isCompleted: true },
    { id: "s2", workoutId: "w1", workoutExerciseId: "e1", order: 2, setType: "working", weightG: 102_500, reps: 5, isCompleted: false },
    { id: "s3", workoutId: "w2", workoutExerciseId: "e2", order: 0, setType: "working", weightG: 140_000, reps: 3, rpe: 8, isCompleted: true },
    { id: "s4", workoutId: "w2", workoutExerciseId: "e3", order: 0, setType: "working", weightG: 100_000, reps: 6, isCompleted: true },
  ],
  measurements: [{ id: "m1", metric: "bodyweight", value: 90_000, date: "2026-01-05" }],
  plates: [],
  bars: [],
  settings: { unitSystem: "imperial", displayName: "Private Name" },
  labLast: { askedAt: "2026-01-05", text: "lab note" },
  programs: [],
  programWeeks: [],
  programSessions: [],
  programExercises: [],
  eraNames: [],
  machineSetups: [],
  lessons: [],
  namedPrs: [],
  clips: [{ id: "clip-1" }],
} as unknown as CloudGym;

describe("the read-only history view", () => {
  it("lists completed sessions newest first, with their completed sets in order", () => {
    const view = historyView(vault);
    expect(view).toMatchObject({ unit: "lb", totalSessions: 2, firstDate: "2026-01-05", lastDate: "2026-01-08", offset: 0 });
    expect(view.sessions.map((row) => row.date)).toEqual(["2026-01-08", "2026-01-05"]);
    expect(view.sessions[0]!.exercises.map((row) => row.name)).toEqual(["Bench Press", "Back Squat"]);
    expect(view.sessions[1]!.exercises[0]!.sets).toEqual([
      { type: "warmup", weightG: 60_000, reps: 8 },
      { type: "working", weightG: 100_000, reps: 5 },
    ]);
    expect(view.sessions[0]!.exercises[1]!.sets).toEqual([{ type: "working", weightG: 140_000, reps: 3, rpe: 8 }]);
    // An hour, less five minutes paused.
    expect(view.sessions[0]!.durationSec).toBe(3300);
  });

  it("carries nothing but the history: no notes, clips, measurements, settings, names or Lab", () => {
    const text = JSON.stringify(historyView(vault));
    for (const secret of ["private note", "elbow", "grindy", "clip-1", "Private Name", "lab note", "90000", "bodyweight"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("pages through a long log", () => {
    const page = historyView(vault, 1, 1);
    expect(page).toMatchObject({ offset: 1, totalSessions: 2 });
    expect(page.sessions.map((row) => row.date)).toEqual(["2026-01-05"]);
    expect(historyView(vault, 5).sessions).toEqual([]);
  });

  it("has an empty log's shape for a vault with no sessions", () => {
    expect(historyView({ ...vault, workouts: [] })).toMatchObject({ totalSessions: 0, sessions: [], firstDate: undefined });
  });
});

describe("the token", () => {
  it("is 256 random bits in URL-safe text, different every time", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newHistoryToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(HISTORY_TOKEN_PATTERN);
  });
});
