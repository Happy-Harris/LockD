import { uuid } from "@/domain/ids";
import { addDays, localDateOf } from "@/domain/time";
import type {
  BodyMeasurement,
  EraName,
  Exercise,
  Program,
  ProgramExercise,
  ProgramSession,
  ProgramWeek,
  Template,
  TemplateExercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "@/domain/types";
import { toGrams } from "@/domain/units";
import { installPack, PROGRAM_PACKS } from "./programs";
import { buildStarterTemplate, seedExerciseId, STARTER_TEMPLATES } from "./seed";

export interface DemoLog {
  templates: Template[];
  templateExercises: TemplateExercise[];
  workouts: Workout[];
  workoutExercises: WorkoutExercise[];
  workoutSets: WorkoutSet[];
  measurements: BodyMeasurement[];
  programs: Program[];
  programWeeks: ProgramWeek[];
  programSessions: ProgramSession[];
  programExercises: ProgramExercise[];
  eraNames: EraName[];
}

interface LiftPlan {
  name: string;
  sets: number;
  reps: number;
  rest: number;
  extra?: boolean;
}

const PUSH: LiftPlan[] = [
  { name: "Bench Press", sets: 4, reps: 6, rest: 150 },
  { name: "Overhead Press", sets: 3, reps: 8, rest: 120 },
  { name: "Incline Dumbbell Press", sets: 3, reps: 10, rest: 90 },
  { name: "Lateral Raise", sets: 3, reps: 14, rest: 60 },
  { name: "Cable Triceps Pushdown", sets: 3, reps: 12, rest: 60 },
  { name: "Dip", sets: 3, reps: 8, rest: 90, extra: true },
];

const PULL: LiftPlan[] = [
  { name: "Conventional Deadlift", sets: 3, reps: 5, rest: 180 },
  { name: "Lat Pulldown", sets: 3, reps: 10, rest: 90 },
  { name: "Seated Cable Row", sets: 3, reps: 10, rest: 90 },
  { name: "Face Pull", sets: 3, reps: 15, rest: 60 },
  { name: "Barbell Curl", sets: 3, reps: 10, rest: 60 },
  { name: "Pull-Up", sets: 3, reps: 6, rest: 120, extra: true },
];

const LEGS: LiftPlan[] = [
  { name: "Back Squat", sets: 4, reps: 6, rest: 180 },
  { name: "Romanian Deadlift", sets: 3, reps: 8, rest: 120 },
  { name: "Leg Press", sets: 3, reps: 12, rest: 90 },
  { name: "Leg Extension", sets: 3, reps: 12, rest: 60 },
  { name: "Standing Calf Raise", sets: 4, reps: 12, rest: 60 },
];

type Style = "foundation" | "comeback" | "volume" | "stall" | "strength" | "layoff";

interface EraSpec {
  name: string;
  weeks: number;
  style: Style;
  attendance: number;
}

const ERAS: EraSpec[] = [
  { name: "Foundation", weeks: 12, style: "foundation", attendance: 1 },
  { name: "Travel layoff", weeks: 3, style: "layoff", attendance: 0 },
  { name: "The Return", weeks: 10, style: "comeback", attendance: 0.95 },
  { name: "Volume Summer", weeks: 12, style: "volume", attendance: 0.88 },
  { name: "The Grind", weeks: 4, style: "stall", attendance: 0.75 },
  { name: "Iron Block", weeks: 11, style: "strength", attendance: 0.95 },
];

interface LiftState {
  kg: number;
  reps: number;
}

function atHour(date: Date, hour: number, minute = 12): Date {
  const next = new Date(date);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function keepSession(week: number, day: number, rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  const n = (week * 13 + day * 7 + 3) % 100;
  return n < rate * 100;
}

function startOfThisWeek(reference: Date): Date {
  const start = new Date(reference);
  const delta = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - delta);
  start.setHours(0, 0, 0, 0);
  return start;
}

function jitter(week: number, setIndex: number, amplitude: number): number {
  const n = ((week * 17 + setIndex * 9) % 7) - 3;
  return (n / 3) * amplitude;
}

export function buildDemoLog(exercises: Exercise[], now = new Date()): DemoLog {
  const stamp = now.toISOString();
  const pushPreset = STARTER_TEMPLATES.find((row) => row.id === "starter-push")!;
  const pullPreset = STARTER_TEMPLATES.find((row) => row.id === "starter-pull")!;
  const legsPreset = STARTER_TEMPLATES.find((row) => row.id === "starter-legs")!;
  const built = [pushPreset, pullPreset, legsPreset].map((preset, index) =>
    buildStarterTemplate(preset, index, stamp),
  );

  const templates = built.map((entry) => entry.template);
  const templateExercises = built.flatMap((entry) => entry.exercises);
  const byName = new Map(exercises.map((exercise) => [exercise.name, exercise]));

  const workouts: Workout[] = [];
  const workoutExercises: WorkoutExercise[] = [];
  const workoutSets: WorkoutSet[] = [];
  const eraNames: EraName[] = [];

  const monday = startOfThisWeek(now);
  const totalWeeks = ERAS.reduce((sum, era) => sum + era.weeks, 0);
  const firstMonday = addDays(monday, -(totalWeeks - 1) * 7);

  const lifts: Record<string, LiftState> = {
    "Bench Press": { kg: 72, reps: 6 },
    "Overhead Press": { kg: 44, reps: 8 },
    "Incline Dumbbell Press": { kg: 26, reps: 10 },
    "Lateral Raise": { kg: 10, reps: 14 },
    "Cable Triceps Pushdown": { kg: 22, reps: 12 },
    Dip: { kg: 0, reps: 8 },
    "Conventional Deadlift": { kg: 120, reps: 5 },
    "Lat Pulldown": { kg: 55, reps: 10 },
    "Seated Cable Row": { kg: 50, reps: 10 },
    "Face Pull": { kg: 14, reps: 15 },
    "Barbell Curl": { kg: 28, reps: 10 },
    "Pull-Up": { kg: 0, reps: 6 },
    "Back Squat": { kg: 95, reps: 6 },
    "Romanian Deadlift": { kg: 75, reps: 8 },
    "Leg Press": { kg: 150, reps: 12 },
    "Leg Extension": { kg: 48, reps: 12 },
    "Standing Calf Raise": { kg: 70, reps: 12 },
  };

  const stepWeek = (style: Style, weekInEra: number) => {
    const bump = (name: string, kg: number, reps = 0) => {
      const row = lifts[name];
      if (!row) return;
      row.kg = Math.max(0, row.kg + kg);
      row.reps = Math.max(3, row.reps + reps);
    };
    if (style === "layoff") return;
    if (style === "foundation") {
      bump("Bench Press", 1.25);
      bump("Back Squat", 2.5);
      bump("Conventional Deadlift", 2.5);
      bump("Overhead Press", 0.5);
      bump("Romanian Deadlift", 1.25);
      bump("Lat Pulldown", 1.25);
      bump("Seated Cable Row", 1.25);
      bump("Incline Dumbbell Press", 0.5);
      bump("Cable Triceps Pushdown", 0.5);
      bump("Barbell Curl", 0.5);
      bump("Leg Press", 2.5);
      bump("Leg Extension", 1.25);
      bump("Standing Calf Raise", 1.25);
    } else if (style === "comeback") {
      if (weekInEra === 0) {
        bump("Bench Press", -6);
        bump("Back Squat", -8);
        bump("Conventional Deadlift", -10);
        bump("Overhead Press", -3);
      } else {
        bump("Bench Press", 1.5);
        bump("Back Squat", 2.5);
        bump("Conventional Deadlift", 2.5);
        bump("Overhead Press", 0.75);
        bump("Pull-Up", 0, weekInEra % 2 === 0 ? 1 : 0);
      }
    } else if (style === "volume") {
      bump("Bench Press", weekInEra === 9 ? 2.5 : 0.5);
      bump("Back Squat", 0.5);
      bump("Conventional Deadlift", 0.5);
      bump("Overhead Press", 0.25);
      bump("Pull-Up", 0, 1);
      bump("Dip", 0, 1);
      bump("Lat Pulldown", 1.25);
      bump("Leg Press", 2.5);
    } else if (style === "stall") {
      bump("Bench Press", weekInEra === 2 ? -2.5 : 0);
      bump("Back Squat", weekInEra === 1 ? -2.5 : 0);
      bump("Overhead Press", 0);
    } else if (style === "strength") {
      bump("Bench Press", 1.25);
      bump("Back Squat", 1.25);
      bump("Conventional Deadlift", 2.5);
      bump("Overhead Press", 0.5);
      bump("Pull-Up", 0, weekInEra % 3 === 0 ? 1 : 0);
    }
  };

  let weekCursor = 0;
  for (const era of ERAS) {
    const eraStart = addDays(firstMonday, weekCursor * 7);
    eraNames.push({ startDate: localDateOf(eraStart), name: era.name });
    for (let w = 0; w < era.weeks; w += 1) {
      const globalWeek = weekCursor + w;
      const weekStart = addDays(firstMonday, globalWeek * 7);
      if (era.style !== "layoff") stepWeek(era.style, w);
      if (era.style === "layoff") continue;
      if (weekStart.getTime() > now.getTime()) continue;

      const extras = era.style === "volume" || era.style === "strength" || era.style === "comeback";
      const sessions: Array<{ dayOffset: number; hour: number; name: string; templateIndex: number; plan: LiftPlan[] }> = [
        { dayOffset: 0, hour: 18, name: "Push Day", templateIndex: 0, plan: PUSH },
        { dayOffset: 2, hour: 18, name: "Pull Day", templateIndex: 1, plan: PULL },
        { dayOffset: 4, hour: 17, name: "Leg Day", templateIndex: 2, plan: LEGS },
      ];

      for (const session of sessions) {
        if (!keepSession(globalWeek, session.dayOffset, era.attendance)) continue;
        const day = addDays(weekStart, session.dayOffset);
        if (day.getTime() > now.getTime()) continue;
        const start = atHour(day, session.hour, 6 + (globalWeek % 11));
        const duration = 54 + (globalWeek % 9) + session.templateIndex * 4;
        const ended = new Date(start.getTime() + duration * 60_000);
        const workoutId = uuid();
        const template = templates[session.templateIndex]!;
        workouts.push({
          id: workoutId,
          templateId: template.id,
          name: session.name,
          status: "completed",
          startedAt: start.toISOString(),
          endedAt: ended.toISOString(),
          localDate: localDateOf(day),
          tzOffsetMinutes: day.getTimezoneOffset(),
          pausedSeconds: 0,
          createdAt: start.toISOString(),
          updatedAt: ended.toISOString(),
        });

        const plan = session.plan.filter((lift) => !lift.extra || extras);
        const volumeSets = era.style === "volume" ? 1 : 0;
        const stallMiss = era.style === "stall";
        const strengthReps = era.style === "strength" ? -1 : 0;

        plan.forEach((lift, exerciseOrder) => {
          const library = byName.get(lift.name) ?? exercises.find((row) => row.id === seedExerciseId(lift.name));
          if (!library) return;
          const state = lifts[lift.name] ?? { kg: 20, reps: lift.reps };
          const workoutExerciseId = uuid();
          workoutExercises.push({
            id: workoutExerciseId,
            workoutId,
            exerciseId: library.id,
            order: exerciseOrder,
            exerciseNameSnapshot: library.name,
            primaryMuscleGroupSnapshot: library.primaryMuscleGroup,
            secondaryMuscleGroupsSnapshot: library.secondaryMuscleGroups,
            equipmentSnapshot: library.equipment,
            trackingTypeSnapshot: library.trackingType,
            restSeconds: lift.rest,
          });

          const sets = lift.sets + volumeSets;
          const targetReps = Math.max(3, lift.reps + strengthReps + (era.style === "volume" ? 2 : 0));
          let cursor = start.getTime() + exerciseOrder * 8 * 60_000;
          for (let setIndex = 0; setIndex < sets; setIndex += 1) {
            const last = setIndex === sets - 1;
            let reps = targetReps;
            if (stallMiss) reps = Math.max(2, targetReps - (last ? 2 : 1));
            else if (last && era.style !== "volume" && globalWeek % 7 === 3) reps = Math.max(2, targetReps - 1);
            if (era.style === "foundation" && last && globalWeek % 5 === 0) reps = targetReps;
            const rpe = stallMiss ? (last ? 9.5 : 8.5) : last ? 8.5 : 7.5;
            const kg =
              library.trackingType === "reps_only"
                ? 0
                : Math.max(0, state.kg + jitter(globalWeek, setIndex, 0));
            cursor += lift.rest * 1000;
            workoutSets.push({
              id: uuid(),
              workoutExerciseId,
              workoutId,
              order: setIndex,
              setType: "working",
              weightG: library.trackingType === "reps_only" ? undefined : toGrams(kg, "kg"),
              reps,
              rpe,
              isCompleted: true,
              completedAt: new Date(cursor).toISOString(),
            });
          }
        });
      }
    }
    weekCursor += era.weeks;
  }

  const measurements: BodyMeasurement[] = [];
  for (let week = 0; week < totalWeeks; week += 1) {
    const day = addDays(firstMonday, week * 7 + 6);
    if (day > now) break;
    const kg = 83.2 - week * 0.04 + (week % 5 === 0 ? 0.25 : 0);
    measurements.push(
      measurement("bodyweight", toGrams(kg, "kg"), "kg", day),
      measurement("waist", 870 - week * 1.2, "cm", day),
      measurement("arm_right", 348 + week * 0.18, "cm", day),
      measurement("arm_left", 342 + week * 0.16, "cm", day),
    );
  }

  const iron = PROGRAM_PACKS.find((pack) => pack.id === "pack-linear-strength-8")!;
  const installed = installPack(iron, stamp);
  installed.program.currentWeek = 6;
  installed.program.currentSessionOrder = 1;
  installed.program.isActive = true;

  return {
    templates,
    templateExercises,
    workouts,
    workoutExercises,
    workoutSets,
    measurements,
    programs: [installed.program],
    programWeeks: installed.weeks,
    programSessions: installed.sessions,
    programExercises: installed.exercises,
    eraNames,
  };
}

function measurement(
  metric: BodyMeasurement["metric"],
  value: number,
  displayUnit: BodyMeasurement["displayUnit"],
  day: Date,
): BodyMeasurement {
  const iso = atHour(day, 8, 0).toISOString();
  return {
    id: uuid(),
    metric,
    value,
    displayUnit,
    recordedAt: iso,
    localDate: localDateOf(day),
    createdAt: iso,
    updatedAt: iso,
  };
}

export function emptyStarterPack(now = new Date().toISOString()) {
  const built = STARTER_TEMPLATES.filter((preset) =>
    ["starter-push", "starter-pull", "starter-legs"].includes(preset.id),
  ).map((preset, index) => buildStarterTemplate(preset, index, now));
  return {
    templates: built.map((entry) => entry.template),
    templateExercises: built.flatMap((entry) => entry.exercises),
  };
}

export { seedExerciseId };
