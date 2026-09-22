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

export const SEED_LIBRARY_VERSION = 2;

type SeedTuple = [
  name: string,
  primary: MuscleGroup,
  secondary: MuscleGroup[],
  equipment: Equipment,
  pattern: MovementPattern,
  tracking?: TrackingType,
  unilateral?: boolean,
];

const SEED: SeedTuple[] = [
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

export function seedExercises(now: string): Exercise[] {
  return SEED.map(([name, primary, secondary, equipment, pattern, tracking, unilateral]) => ({
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
