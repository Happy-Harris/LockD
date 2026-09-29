import { uuid } from "@/domain/ids";
import type {
  BarProfile,
  Equipment,
  Exercise,
  MovementPattern,
  MuscleGroup,
  PlateDenomination,
  PlateInventory,
  SetType,
  Template,
  TemplateExercise,
  TrackingType,
} from "@/domain/types";
import { toGrams } from "@/domain/units";

/**
 * Bump when `SEED_ADDITIONS` gains a version. Existing installs take the new exercises once
 * (`topUpSeedLibrary`); new installs start with the whole library.
 */
export const SEED_LIBRARY_VERSION = 3;

/** Installs that predate the top-up carry no version and already have everything up to this one. */
export const SEED_LIBRARY_VERSION_UNTRACKED = 2;

type SeedTuple = [
  name: string,
  primary: MuscleGroup,
  secondary: MuscleGroup[],
  equipment: Equipment,
  pattern: MovementPattern,
  tracking?: TrackingType,
  unilateral?: boolean,
];

/** The library as it stood at version 2, before installs could be topped up. */
const SEED_BASE: SeedTuple[] = [
  ["Back Squat", "quads", ["glutes", "hamstrings", "core"], "barbell", "squat"],
  ["Front Squat", "quads", ["glutes", "core"], "barbell", "squat"],
  ["Conventional Deadlift", "hamstrings", ["glutes", "back", "traps", "forearms"], "barbell", "hinge"],
  ["Sumo Deadlift", "glutes", ["quads", "hamstrings", "back"], "barbell", "hinge"],
  ["Romanian Deadlift", "hamstrings", ["glutes", "back"], "barbell", "hinge"],
  ["Barbell Hip Thrust", "glutes", ["hamstrings", "core"], "barbell", "hinge"],
  ["Bench Press", "chest", ["triceps", "shoulders"], "barbell", "horizontal push"],
  ["Incline Bench Press", "chest", ["shoulders", "triceps"], "barbell", "horizontal push"],
  ["Close-Grip Bench Press", "triceps", ["chest", "shoulders"], "barbell", "horizontal push"],
  ["Overhead Press", "shoulders", ["triceps", "core"], "barbell", "vertical push"],
  ["Barbell Row", "back", ["lats", "biceps", "traps"], "barbell", "horizontal pull"],
  ["Pendlay Row", "back", ["lats", "biceps"], "barbell", "horizontal pull"],
  ["Barbell Curl", "biceps", ["forearms"], "barbell", "isolation"],
  ["Barbell Shrug", "traps", ["forearms"], "barbell", "isolation"],
  ["Good Morning", "hamstrings", ["glutes", "back"], "barbell", "hinge"],
  ["Dumbbell Bench Press", "chest", ["triceps", "shoulders"], "dumbbell", "horizontal push"],
  ["Incline Dumbbell Press", "chest", ["shoulders", "triceps"], "dumbbell", "horizontal push"],
  ["Dumbbell Shoulder Press", "shoulders", ["triceps"], "dumbbell", "vertical push"],
  ["Arnold Press", "shoulders", ["triceps"], "dumbbell", "vertical push"],
  ["Dumbbell Row", "back", ["lats", "biceps"], "dumbbell", "horizontal pull"],
  ["One-Arm Dumbbell Row", "back", ["lats", "biceps"], "dumbbell", "horizontal pull", undefined, true],
  ["Dumbbell Fly", "chest", ["shoulders"], "dumbbell", "isolation"],
  ["Lateral Raise", "shoulders", [], "dumbbell", "isolation"],
  ["Rear Delt Fly", "shoulders", ["back"], "dumbbell", "isolation"],
  ["Dumbbell Curl", "biceps", ["forearms"], "dumbbell", "isolation"],
  ["Hammer Curl", "biceps", ["forearms"], "dumbbell", "isolation"],
  ["Dumbbell Skullcrusher", "triceps", [], "dumbbell", "isolation"],
  ["Dumbbell Romanian Deadlift", "hamstrings", ["glutes", "back"], "dumbbell", "hinge"],
  ["Bulgarian Split Squat", "quads", ["glutes", "hamstrings"], "dumbbell", "lunge", undefined, true],
  ["Goblet Squat", "quads", ["glutes", "core"], "dumbbell", "squat"],
  ["Dumbbell Walking Lunge", "quads", ["glutes", "hamstrings"], "dumbbell", "lunge", undefined, true],
  ["Farmer's Carry", "forearms", ["traps", "core"], "dumbbell", "carry", "distance_duration"],
  ["Leg Press", "quads", ["glutes", "hamstrings"], "machine", "squat"],
  ["Hack Squat", "quads", ["glutes"], "machine", "squat"],
  ["Leg Extension", "quads", [], "machine", "isolation"],
  ["Lying Leg Curl", "hamstrings", ["calves"], "machine", "isolation"],
  ["Seated Leg Curl", "hamstrings", [], "machine", "isolation"],
  ["Standing Calf Raise", "calves", [], "machine", "isolation"],
  ["Seated Calf Raise", "calves", [], "machine", "isolation"],
  ["Hip Abduction", "abductors", ["glutes"], "machine", "isolation"],
  ["Hip Adduction", "adductors", [], "machine", "isolation"],
  ["Chest Press Machine", "chest", ["triceps", "shoulders"], "machine", "horizontal push"],
  ["Pec Deck", "chest", ["shoulders"], "machine", "isolation"],
  ["Lat Pulldown", "lats", ["biceps", "back"], "cable", "vertical pull"],
  ["Seated Cable Row", "back", ["lats", "biceps"], "cable", "horizontal pull"],
  ["Face Pull", "shoulders", ["traps", "back"], "cable", "horizontal pull"],
  ["Cable Triceps Pushdown", "triceps", [], "cable", "isolation"],
  ["Cable Overhead Triceps Extension", "triceps", [], "cable", "isolation"],
  ["Cable Curl", "biceps", ["forearms"], "cable", "isolation"],
  ["Cable Lateral Raise", "shoulders", [], "cable", "isolation"],
  ["Cable Crunch", "core", [], "cable", "core"],
  ["Smith Machine Squat", "quads", ["glutes", "hamstrings"], "smith machine", "squat"],
  ["Pull-Up", "lats", ["biceps", "back"], "bodyweight", "vertical pull", "reps_only"],
  ["Chin-Up", "lats", ["biceps"], "bodyweight", "vertical pull", "reps_only"],
  ["Dip", "chest", ["triceps", "shoulders"], "bodyweight", "horizontal push", "reps_only"],
  ["Push-Up", "chest", ["triceps", "shoulders"], "bodyweight", "horizontal push", "reps_only"],
  ["Hanging Leg Raise", "core", ["forearms"], "bodyweight", "core", "reps_only"],
  ["Plank", "core", ["shoulders"], "bodyweight", "core", "duration"],
  ["Back Extension", "hamstrings", ["glutes", "back"], "bodyweight", "hinge", "reps_only"],
  ["Glute Bridge", "glutes", ["hamstrings"], "bodyweight", "hinge", "reps_only"],
  ["Kettlebell Swing", "glutes", ["hamstrings", "back", "core"], "kettlebell", "hinge"],
  ["Kettlebell Goblet Squat", "quads", ["glutes", "core"], "kettlebell", "squat"],
  ["Band Pull-Apart", "shoulders", ["back", "traps"], "band", "horizontal pull", "reps_only"],
  ["Rowing Machine", "cardio", ["back", "quads"], "machine", "conditioning", "distance_duration"],
  ["Treadmill Run", "cardio", ["quads", "calves"], "machine", "conditioning", "distance_duration"],
  ["Jump Rope", "cardio", ["calves"], "other", "conditioning", "duration"],
];

/**
 * Exercises added by each later version. An install that has already applied a version never
 * receives that version's exercises again, so an exercise the lifter removed does not come back.
 */
const SEED_ADDITIONS: Record<number, SeedTuple[]> = {
  3: [
    ["Box Squat", "quads", ["glutes", "hamstrings"], "barbell", "squat"],
    ["Rack Pull", "back", ["traps", "glutes", "forearms"], "barbell", "hinge"],
    ["Push Press", "shoulders", ["triceps", "quads"], "barbell", "vertical push"],
    ["Wide-Grip Bench Press", "chest", ["shoulders", "triceps"], "barbell", "horizontal push"],
    ["Behind-the-Neck Press", "shoulders", ["triceps"], "barbell", "vertical push"],
    ["Wide-Grip Barbell Row", "back", ["lats", "traps"], "barbell", "horizontal pull"],
    ["Barbell Lunge", "quads", ["glutes", "hamstrings"], "barbell", "lunge"],
    ["Power Clean", "full body", ["traps", "quads", "glutes"], "barbell", "hinge"],
    ["Single-Arm Dumbbell Shoulder Press", "shoulders", ["triceps", "core"], "dumbbell", "vertical push", undefined, true],
    ["Incline Dumbbell Curl", "biceps", ["forearms"], "dumbbell", "isolation"],
    ["Dumbbell Shrug", "traps", ["forearms"], "dumbbell", "isolation"],
    ["Wide-Grip Lat Pulldown", "lats", ["biceps", "back"], "cable", "vertical pull"],
    ["Close-Grip Lat Pulldown", "lats", ["biceps"], "cable", "vertical pull"],
    ["Straight-Arm Pulldown", "lats", ["triceps"], "cable", "isolation"],
    ["Smith Machine Bench Press", "chest", ["triceps", "shoulders"], "smith machine", "horizontal push"],
    ["Smith Machine Overhead Press", "shoulders", ["triceps"], "smith machine", "vertical push"],
    ["Smith Machine Row", "back", ["lats", "biceps"], "smith machine", "horizontal pull"],
    ["Neutral-Grip Pull-Up", "lats", ["biceps", "back"], "bodyweight", "vertical pull", "reps_only"],
    ["Assisted Pull-Up", "lats", ["biceps", "back"], "machine", "vertical pull", "assisted_weight"],
    ["Assisted Dip", "chest", ["triceps"], "machine", "horizontal push", "assisted_weight"],
    ["Inverted Row", "back", ["lats", "biceps"], "bodyweight", "horizontal pull", "reps_only"],
    ["Side Plank", "core", [], "bodyweight", "core", "duration"],
    ["Nordic Curl", "hamstrings", ["glutes"], "bodyweight", "hinge", "reps_only"],
    ["Turkish Get-Up", "full body", ["shoulders", "core"], "kettlebell", "carry"],
    ["Band Face Pull", "shoulders", ["traps"], "band", "horizontal pull", "reps_only"],
    ["Neck Curl", "neck", [], "plate", "isolation"],
    ["Stationary Bike", "cardio", ["quads"], "machine", "conditioning", "distance_duration"],
  ],
};


/** Every exercise in the current library, base first. */
const SEED: SeedTuple[] = [...SEED_BASE, ...Object.values(SEED_ADDITIONS).flat()];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function seedExerciseId(name: string): string {
  return `seed-${slugify(name)}`;
}

function build(tuples: readonly SeedTuple[], now: string): Exercise[] {
  return tuples.map(([name, primary, secondary, equipment, pattern, tracking, unilateral]) => ({
    id: seedExerciseId(name),
    name,
    primaryMuscleGroup: primary,
    secondaryMuscleGroups: secondary,
    equipment,
    movementPattern: pattern,
    trackingType: tracking ?? "weight_reps",
    incrementG: equipment === "dumbbell" ? toGrams(2.5, "kg") : undefined,
    unilateral,
    isCustom: false,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  }));
}

/** The whole library, for a new install. */
export function seedExercises(now: string): Exercise[] {
  return build(SEED, now);
}

/** Exercises added by versions after `version`, in the order they were added. */
export function seedExercisesAddedAfter(version: number, now: string): Exercise[] {
  return build(
    Object.entries(SEED_ADDITIONS)
      .filter(([added]) => Number(added) > version)
      .sort(([a], [b]) => Number(a) - Number(b))
      .flatMap(([, tuples]) => tuples),
    now,
  );
}

/**
 * What an existing install needs to catch up with the library: the exercises added since the
 * version it last applied. Additive only:
 *  - nothing that exists is changed (a seeded exercise the lifter edited or archived stays as is);
 *  - an exercise is skipped when one with that id, or the same name, already exists, so a custom
 *    "Box Squat" is not duplicated;
 *  - only versions the install has not applied are considered, so an exercise it once had and
 *    removed is not brought back.
 */
export function topUpSeedLibrary(
  existing: readonly Exercise[],
  appliedVersion: number | undefined,
  now: string,
): Exercise[] {
  const ids = new Set(existing.map((exercise) => exercise.id));
  const names = new Set(existing.map((exercise) => slugify(exercise.name)));
  return seedExercisesAddedAfter(appliedVersion ?? SEED_LIBRARY_VERSION_UNTRACKED, now).filter(
    (exercise) => !ids.has(exercise.id) && !names.has(slugify(exercise.name)),
  );
}

const KG_PLATES: Array<[kg: number, count: number]> = [
  [25, 4],
  [20, 4],
  [15, 2],
  [10, 4],
  [5, 4],
  [2.5, 4],
  [1.25, 4],
  [0.5, 2],
];

const LB_PLATES: Array<[lb: number, count: number]> = [
  [45, 4],
  [35, 2],
  [25, 4],
  [10, 4],
  [5, 4],
  [2.5, 4],
];

function plates(source: Array<[number, number]>, unit: "kg" | "lb"): PlateDenomination[] {
  return source.map(([value, count]) => ({ weightG: toGrams(value, unit), count }));
}

export function seedPlateInventories(): PlateInventory[] {
  return [
    {
      id: "seed-plates-kg",
      name: "Standard kg gym",
      unit: "kg",
      plates: plates(KG_PLATES, "kg"),
      isDefault: true,
    },
    {
      id: "seed-plates-lb",
      name: "Standard lb gym",
      unit: "lb",
      plates: plates(LB_PLATES, "lb"),
      isDefault: false,
    },
  ];
}

export function seedBarProfiles(): BarProfile[] {
  return [
    { id: "seed-bar-olympic-kg", name: "Olympic bar (20 kg)", weightG: toGrams(20, "kg"), collarWeightG: 0, isDefault: true },
    { id: "seed-bar-olympic-lb", name: "Olympic bar (45 lb)", weightG: toGrams(45, "lb"), collarWeightG: 0, isDefault: false },
    { id: "seed-bar-womens", name: "Women's bar (15 kg)", weightG: toGrams(15, "kg"), collarWeightG: 0, isDefault: false },
    { id: "seed-bar-ez", name: "EZ curl bar (10 kg)", weightG: toGrams(10, "kg"), collarWeightG: 0, isDefault: false },
    { id: "seed-bar-trap", name: "Trap bar (25 kg)", weightG: toGrams(25, "kg"), collarWeightG: 0, isDefault: false },
  ];
}

interface StarterExercise {
  exerciseName: string;
  targetSets: number;
  targetRepMin?: number;
  targetRepMax?: number;
  restSeconds: number;
  defaultSetType?: SetType;
  includeWarmup?: boolean;
}

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  category: "Split" | "Low-impact" | "Athletic";
  exercises: StarterExercise[];
}

function ex(
  exerciseName: string,
  targetSets: number,
  targetRepMin: number,
  targetRepMax: number,
  restSeconds: number,
  includeWarmup = false,
): StarterExercise {
  return { exerciseName, targetSets, targetRepMin, targetRepMax, restSeconds, includeWarmup };
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "starter-full-body",
    name: "Full Body Strength",
    description: "A balanced 3×/week session: squat, push, pull, hinge.",
    category: "Split",
    exercises: [
      ex("Back Squat", 3, 5, 8, 150, true),
      ex("Bench Press", 3, 5, 8, 120, true),
      ex("Barbell Row", 3, 8, 10, 90),
      ex("Romanian Deadlift", 3, 8, 10, 120),
      ex("Plank", 3, 30, 60, 60),
    ],
  },
  {
    id: "starter-push",
    name: "Push Day",
    description: "Chest, shoulders and triceps — pairs with Pull and Legs.",
    category: "Split",
    exercises: [
      ex("Bench Press", 4, 5, 8, 120, true),
      ex("Overhead Press", 3, 6, 10, 90),
      ex("Incline Dumbbell Press", 3, 8, 12, 90),
      ex("Lateral Raise", 3, 12, 15, 60),
      ex("Cable Triceps Pushdown", 3, 10, 15, 60),
    ],
  },
  {
    id: "starter-pull",
    name: "Pull Day",
    description: "Back and biceps — pairs with Push and Legs.",
    category: "Split",
    exercises: [
      ex("Conventional Deadlift", 3, 4, 6, 180, true),
      ex("Lat Pulldown", 3, 8, 12, 90),
      ex("Seated Cable Row", 3, 8, 12, 90),
      ex("Face Pull", 3, 12, 15, 60),
      ex("Barbell Curl", 3, 8, 12, 60),
    ],
  },
  {
    id: "starter-legs",
    name: "Leg Day",
    description: "Quads, hamstrings, glutes and calves.",
    category: "Split",
    exercises: [
      ex("Back Squat", 4, 5, 8, 150, true),
      ex("Romanian Deadlift", 3, 8, 10, 120),
      ex("Leg Press", 3, 10, 15, 90),
      ex("Leg Extension", 3, 12, 15, 60),
      ex("Standing Calf Raise", 4, 10, 15, 60),
    ],
  },
  {
    id: "starter-upper",
    name: "Upper Body",
    description: "Chest, back, shoulders and arms — pairs with Lower.",
    category: "Split",
    exercises: [
      ex("Bench Press", 4, 5, 8, 120, true),
      ex("Barbell Row", 4, 6, 10, 90),
      ex("Overhead Press", 3, 6, 10, 90),
      ex("Lat Pulldown", 3, 8, 12, 90),
      ex("Dumbbell Curl", 2, 10, 15, 60),
      ex("Cable Triceps Pushdown", 2, 10, 15, 60),
    ],
  },
  {
    id: "starter-lower",
    name: "Lower Body",
    description: "Quads, hamstrings and glutes — pairs with Upper.",
    category: "Split",
    exercises: [
      ex("Back Squat", 4, 5, 8, 150, true),
      ex("Romanian Deadlift", 3, 8, 10, 120),
      ex("Leg Press", 3, 10, 15, 90),
      ex("Lying Leg Curl", 3, 10, 15, 60),
      ex("Standing Calf Raise", 3, 10, 15, 60),
    ],
  },
  {
    id: "starter-low-impact-full-body",
    name: "Low-Impact Full Body",
    description: "Machine and bodyweight work with no barbell on the spine.",
    category: "Low-impact",
    exercises: [
      ex("Leg Press", 3, 10, 15, 120),
      ex("Chest Press Machine", 3, 10, 15, 90),
      ex("Seated Cable Row", 3, 10, 15, 90),
      ex("Dumbbell Shoulder Press", 3, 10, 15, 90),
      ex("Glute Bridge", 3, 12, 20, 60),
    ],
  },
  {
    id: "starter-athletic-conditioning",
    name: "Athletic Conditioning",
    description: "Swings, carries and intervals — sport density, not a split.",
    category: "Athletic",
    exercises: [
      ex("Kettlebell Goblet Squat", 3, 12, 15, 60),
      ex("Kettlebell Swing", 4, 15, 20, 60),
      { exerciseName: "Farmer's Carry", targetSets: 3, restSeconds: 60 },
      { exerciseName: "Rowing Machine", targetSets: 4, restSeconds: 90 },
      { exerciseName: "Jump Rope", targetSets: 3, restSeconds: 45 },
    ],
  },
];

export function buildStarterTemplate(
  preset: StarterTemplate,
  order: number,
  now = new Date().toISOString(),
): { template: Template; exercises: TemplateExercise[] } {
  const templateId = uuid();
  const template: Template = {
    id: templateId,
    name: preset.name,
    notes: preset.description,
    order,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };
  const exercises: TemplateExercise[] = preset.exercises.map((entry, index) => ({
    id: uuid(),
    templateId,
    exerciseId: seedExerciseId(entry.exerciseName),
    order: index,
    targetSets: entry.targetSets,
    targetRepMin: entry.targetRepMin,
    targetRepMax: entry.targetRepMax,
    restSeconds: entry.restSeconds,
    defaultSetType: entry.defaultSetType ?? "working",
    includeWarmup: entry.includeWarmup ?? false,
  }));
  return { template, exercises };
}
