import { uuid } from "@/domain/ids";
import { slugify } from "@/lib/gym/seed";
import { nowParts } from "@/domain/time";
import type { Exercise, MuscleGroup, Workout, WorkoutExercise, WorkoutSet } from "@/domain/types";
import { parseWeightInput, type WeightUnit } from "@/domain/units";

export type CsvField =
  | "date"
  | "name"
  | "duration"
  | "exercise"
  | "setOrder"
  | "weight"
  | "reps"
  | "distance"
  | "seconds"
  | "notes"
  | "workoutNotes"
  | "rpe"
  | "setType";

const HEADER_ALIASES: Record<string, CsvField> = {
  date: "date",
  workoutdate: "date",
  starttime: "date",
  datum: "date",
  fecha: "date",
  workoutname: "name",
  workout: "name",
  name: "name",
  training: "name",
  entrenamiento: "name",
  duration: "duration",
  workoutduration: "duration",
  dauer: "duration",
  exercisename: "exercise",
  exercise: "exercise",
  ubung: "exercise",
  ejercicio: "exercise",
  setorder: "setOrder",
  set: "setOrder",
  setnumber: "setOrder",
  setindex: "setOrder",
  weight: "weight",
  weightkg: "weight",
  weightlbs: "weight",
  gewicht: "weight",
  peso: "weight",
  reps: "reps",
  repetitions: "reps",
  wiederholungen: "reps",
  repeticiones: "reps",
  distance: "distance",
  distancem: "distance",
  distancekm: "distance",
  distancemiles: "distance",
  seconds: "seconds",
  time: "seconds",
  durationseconds: "seconds",
  rpe: "rpe",
  notes: "notes",
  setnotes: "notes",
  note: "notes",
  workoutnotes: "workoutNotes",
  sessionnotes: "workoutNotes",
  settype: "setType",
  type: "setType",
};

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === "," || ch === ";") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      if (row.some((part) => part.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    cell += ch;
  }
  row.push(cell);
  if (row.some((part) => part.trim())) rows.push(row);
  return rows;
}

function detectWeightUnit(header: string, fallback: WeightUnit): WeightUnit {
  const lower = header.toLowerCase();
  if (lower.includes("lb") || lower.includes("lbs") || lower.includes("pound")) return "lb";
  if (lower.includes("kg")) return "kg";
  return fallback;
}

function parseDurationSeconds(raw: string): number {
  const value = raw.trim().toLowerCase();
  if (!value) return 0;
  const hms = value.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (hms) {
    const h = Number(hms[1]);
    const m = Number(hms[2]);
    const s = Number(hms[3] ?? 0);
    return h * 3600 + m * 60 + s;
  }
  const minutes = value.match(/^(\d+)\s*m/);
  if (minutes) return Number(minutes[1]) * 60;
  const hours = value.match(/^(\d+)\s*h/);
  if (hours) return Number(hours[1]) * 3600;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? Math.round(asNumber) : 0;
}

function parseDate(raw: string): { iso: string; localDate: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnly) {
    const iso = new Date(`${dateOnly[1]}T12:00:00`).toISOString();
    return { iso, localDate: dateOnly[1]! };
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed);
  const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { iso: date.toISOString(), localDate };
}

function tokens(name: string): string[] {
  return slugify(name)
    .split("-")
    .filter((part) => part.length > 2 && !["the", "and", "with", "barbell", "dumbbell", "machine"].includes(part));
}

export function matchExercise(name: string, library: Exercise[]): Exercise | undefined {
  const needle = slugify(name);
  const exact = library.find((row) => slugify(row.name) === needle);
  if (exact) return exact;
  const wanted = new Set(tokens(name));
  if (wanted.size === 0) return undefined;
  let best: { exercise: Exercise; score: number } | undefined;
  for (const exercise of library) {
    const have = new Set(tokens(exercise.name));
    let hit = 0;
    for (const token of wanted) if (have.has(token)) hit += 1;
    const score = hit / Math.max(wanted.size, have.size);
    if (score >= 0.5 && (!best || score > best.score)) best = { exercise, score };
  }
  return best?.exercise;
}

export interface StrongImportPreview {
  workouts: number;
  sets: number;
  skipped: number;
  issues: string[];
  unmatched: string[];
}

export interface StrongImportPayload {
  workouts: Workout[];
  workoutExercises: WorkoutExercise[];
  workoutSets: WorkoutSet[];
  customExercises: Exercise[];
  preview: StrongImportPreview;
}

export function buildStrongImport(text: string, library: Exercise[], unit: WeightUnit): StrongImportPayload {
  const rows = parseCsv(text);
  const issues: string[] = [];
  const unmatched = new Set<string>();
  if (rows.length < 2) {
    return {
      workouts: [],
      workoutExercises: [],
      workoutSets: [],
      customExercises: [],
      preview: { workouts: 0, sets: 0, skipped: 0, issues: ["No data rows in that file."], unmatched: [] },
    };
  }
  const headers = rows[0]!.map((header) => header.trim());
  const map = new Map<number, CsvField>();
  let weightUnit = unit;
  headers.forEach((header, index) => {
    const field = HEADER_ALIASES[normalizeHeader(header)];
    if (field) map.set(index, field);
    if (field === "weight") weightUnit = detectWeightUnit(header, unit);
  });
  if (![...map.values()].includes("date") || ![...map.values()].includes("exercise")) {
    issues.push("Could not find Date and Exercise columns.");
  }

  const customExercises: Exercise[] = [];
  const libraryPlus = [...library];
  const groups = new Map<
    string,
    {
      workout: Workout;
      exercises: Map<string, { we: WorkoutExercise; sets: WorkoutSet[] }>;
    }
  >();
  let skipped = 0;
  let setCount = 0;
  const stamp = nowParts();

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]!;
    const get = (field: CsvField) => {
      for (const [index, mapped] of map) {
        if (mapped === field) return row[index]?.trim() ?? "";
      }
      return "";
    };
    const setOrderRaw = get("setOrder").toLowerCase();
    if (setOrderRaw.includes("rest") || setOrderRaw.includes("timer")) {
      skipped += 1;
      issues.push(`Row ${i + 1}: skipped a rest-timer line.`);
      continue;
    }
    const exerciseName = get("exercise");
    if (!exerciseName) {
      skipped += 1;
      issues.push(`Row ${i + 1}: missing exercise name.`);
      continue;
    }
    const parsedDate = parseDate(get("date"));
    if (!parsedDate) {
      skipped += 1;
      issues.push(`Row ${i + 1}: unreadable date.`);
      continue;
    }
    const workoutName = get("name") || "Imported session";
    const key = `${parsedDate.localDate}|${workoutName}`;
    let group = groups.get(key);
    if (!group) {
      const workout: Workout = {
        id: uuid(),
        name: workoutName,
        status: "completed",
        startedAt: parsedDate.iso,
        endedAt: parsedDate.iso,
        localDate: parsedDate.localDate,
        tzOffsetMinutes: stamp.tzOffsetMinutes,
        pausedSeconds: 0,
        notes: get("workoutNotes") || undefined,
        createdAt: stamp.iso,
        updatedAt: stamp.iso,
      };
      const duration = parseDurationSeconds(get("duration"));
      if (duration > 0) {
        workout.endedAt = new Date(Date.parse(parsedDate.iso) + duration * 1000).toISOString();
      }
      group = { workout, exercises: new Map() };
      groups.set(key, group);
    }
    let matched = matchExercise(exerciseName, libraryPlus);
    if (!matched) {
      unmatched.add(exerciseName);
      const custom: Exercise = {
        id: uuid(),
        name: exerciseName,
        primaryMuscleGroup: "unmapped" as MuscleGroup,
        secondaryMuscleGroups: [],
        equipment: "other",
        movementPattern: "isolation",
        trackingType: "weight_reps",
        isCustom: true,
        isArchived: false,
        createdAt: stamp.iso,
        updatedAt: stamp.iso,
      };
      customExercises.push(custom);
      libraryPlus.push(custom);
      matched = custom;
    }
    let block = group.exercises.get(matched.id);
    if (!block) {
      const we: WorkoutExercise = {
        id: uuid(),
        workoutId: group.workout.id,
        exerciseId: matched.id,
        order: group.exercises.size,
        exerciseNameSnapshot: matched.name,
        primaryMuscleGroupSnapshot: matched.primaryMuscleGroup,
        secondaryMuscleGroupsSnapshot: matched.secondaryMuscleGroups,
        equipmentSnapshot: matched.equipment,
        trackingTypeSnapshot: matched.trackingType,
        restSeconds: 120,
      };
      block = { we, sets: [] };
      group.exercises.set(matched.id, block);
    }
    const typeRaw = get("setType").toLowerCase();
    const setType =
      typeRaw.includes("warm") ? "warmup" : typeRaw.includes("drop") ? "drop" : typeRaw.includes("fail") ? "failure" : "working";
    const weightG = parseWeightInput(get("weight").replace(/[^\d.,-]/g, ""), weightUnit);
    const repsRaw = Number(get("reps"));
    const rpeRaw = Number(get("rpe"));
    const secondsRaw = Number(get("seconds"));
    const set: WorkoutSet = {
      id: uuid(),
      workoutExerciseId: block.we.id,
      workoutId: group.workout.id,
      order: block.sets.length,
      setType,
      weightG,
      reps: Number.isFinite(repsRaw) ? repsRaw : undefined,
      rpe: Number.isFinite(rpeRaw) && rpeRaw > 0 ? rpeRaw : undefined,
      durationSeconds: Number.isFinite(secondsRaw) && secondsRaw > 0 ? secondsRaw : undefined,
      isCompleted: true,
      completedAt: parsedDate.iso,
      notes: get("notes") || undefined,
    };
    block.sets.push(set);
    setCount += 1;
  }

  const workouts: Workout[] = [];
  const workoutExercises: WorkoutExercise[] = [];
  const workoutSets: WorkoutSet[] = [];
  for (const group of groups.values()) {
    workouts.push(group.workout);
    for (const block of group.exercises.values()) {
      workoutExercises.push(block.we);
      workoutSets.push(...block.sets);
    }
  }

  return {
    workouts,
    workoutExercises,
    workoutSets,
    customExercises,
    preview: {
      workouts: workouts.length,
      sets: setCount,
      skipped,
      issues: issues.slice(0, 40),
      unmatched: [...unmatched],
    },
  };
}

export function exportSetsCsv(args: {
  workouts: Workout[];
  exercises: WorkoutExercise[];
  sets: WorkoutSet[];
  unit: WeightUnit;
  formatWeight: (grams: number) => string;
}): string {
  const header = "Date,Workout Name,Exercise Name,Set Order,Set Type,Weight,Reps,RPE,Seconds,Notes";
  const lines = [header];
  const completed = args.workouts.filter((row) => row.status === "completed");
  for (const workout of completed) {
    const blocks = args.exercises
      .filter((row) => row.workoutId === workout.id)
      .sort((a, b) => a.order - b.order);
    for (const exercise of blocks) {
      const sets = args.sets
        .filter((set) => set.workoutExerciseId === exercise.id)
        .sort((a, b) => a.order - b.order);
      sets.forEach((set, index) => {
        const cells = [
          workout.localDate,
          workout.name,
          exercise.exerciseNameSnapshot,
          String(index + 1),
          set.setType,
          set.weightG != null ? args.formatWeight(set.weightG) : "",
          set.reps != null ? String(set.reps) : "",
          set.rpe != null ? String(set.rpe) : "",
          set.durationSeconds != null ? String(set.durationSeconds) : "",
          set.notes ?? "",
        ].map((cell) => {
          const safe = cell.startsWith("=") || cell.startsWith("+") || cell.startsWith("-") || cell.startsWith("@") ? `'${cell}` : cell;
          return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        });
        lines.push(cells.join(","));
      });
    }
  }
  return lines.join("\n");
}
