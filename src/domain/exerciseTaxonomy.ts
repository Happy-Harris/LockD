import type { Equipment, MovementPattern, MuscleGroup } from "./types";

export interface ExerciseTaxonomySuggestion {
  primaryMuscleGroup: MuscleGroup;
  equipment: Equipment;
  movementPattern: MovementPattern;
}

function inferEquipment(name: string): Equipment {
  if (/\bsmith machine\b/.test(name)) return "smith machine";
  if (/\bband\b/.test(name)) return "band";
  if (/\bcable\b|\bcrossover\b|\bpull ?down\b|\bpush ?down\b|\bface pull\b/.test(name))
    return "cable";
  if (/\bdumbbell\b/.test(name)) return "dumbbell";
  if (/\bbarbell\b|\bez bar\b/.test(name)) return "barbell";
  if (/\bmachine\b|\bleg press\b|\bhack squat\b/.test(name)) return "machine";
  if (/\bpush ups?\b|\bdips?\b|\bbodyweight\b|\brussian twist\b/.test(name)) return "bodyweight";
  return "other";
}

function inferMuscle(name: string): MuscleGroup | null {
  if (/\bfarmer s walk on toes\b/.test(name)) return "calves";
  if (/\bcalf|calves\b/.test(name)) return "calves";
  if (/\bside leg raises?\b/.test(name)) return "abductors";
  if (/\bcrunch\b|\bleg raises?\b|\brussian twist\b|\btorso rotation\b/.test(name)) return "core";
  if (/\bfarmer s walk\b/.test(name)) return "forearms";
  if (/\bwrist\b|\bgrip holds?\b/.test(name)) return "forearms";
  if (/\bnordic curls?\b/.test(name)) return "hamstrings";
  if (/\bneck (curls?|extensions?|flexions?)\b/.test(name)) return "neck";
  if (/\bleg curls?\b|\bstanding leg curls?\b|\bglute ham raise\b/.test(name)) return "hamstrings";
  if (/\bshrugs?\b/.test(name)) return "traps";
  if (/\bhip thrust\b|\bglute kickback\b/.test(name)) return "glutes";
  if (/\bdeadlift\b|\brdls?\b|\bromanian\b/.test(name)) return "hamstrings";
  if (/\btriceps?\b|\bskullcrushers?\b|\bpushdowns?\b|\btricep kickback\b/.test(name))
    return "triceps";
  if (/\b(?:bicep|biceps)\b|\bcurls?\b/.test(name)) return "biceps";
  if (
    /\boverhead press\b|\bshoulder press\b|\blateral raises?\b|\bfront raises?\b|\breverse fly\b|\brear delt\b|\bupright row\b|\by raises?\b|\bface pull\b/.test(
      name,
    )
  )
    return "shoulders";
  if (/\blat pull ?down\b|\bpull ?down\b|\bpullovers?\b|\blat push down\b/.test(name))
    return "lats";
  if (/\brack pull\b/.test(name)) return "back";
  if (/\brows?\b/.test(name)) return "back";
  if (
    /\bchest\b|\bbench\b|\bfloor press\b|\bpush ups?\b|\bdips?\b|\bflies\b|\bfly\b|\bcrossover\b/.test(
      name,
    )
  )
    return "chest";
  if (/\bsquats?\b|\blunges?\b|\bleg press\b|\bleg extensions?\b|\bstep up\b/.test(name))
    return "quads";
  return null;
}

function inferMovement(name: string, muscle: MuscleGroup): MovementPattern {
  if (/\bfarmer s walk\b/.test(name)) return "carry";
  if (muscle === "core") return "core";
  if (muscle === "calves" || muscle === "forearms" || muscle === "abductors") return "isolation";
  if (/\bnordic curls?\b/.test(name)) return "hinge";
  if (/\bsquats?\b|\bleg press\b/.test(name)) return "squat";
  if (/\blunges?\b|\bstep up\b/.test(name)) return "lunge";
  if (
    /\bdeadlift\b|\brdls?\b|\bromanian\b|\bhip thrust\b|\bglute ham raise\b|\brack pull\b/.test(
      name,
    )
  )
    return "hinge";
  if (/\boverhead press\b|\bshoulder press\b/.test(name)) return "vertical push";
  if (/\bchest press\b|\bbench\b|\bfloor press\b|\bpush ups?\b|\bdips?\b/.test(name))
    return "horizontal push";
  if (/\bpull ?down\b/.test(name)) return "vertical pull";
  if (/\bupright row\b/.test(name)) return "isolation";
  if (/\bface pull\b/.test(name)) return "horizontal pull";
  if (/\brows?\b/.test(name)) return "horizontal pull";
  if (/\bcrunch\b|\bleg raises?\b|\brussian twist\b|\btorso rotation\b/.test(name)) return "core";
  if (/\bcarry\b|\bfarmer s walk\b/.test(name)) return "carry";
  return "isolation";
}

/**
 * Returns only conservative, name-derived suggestions for imported exercises.
 * The caller must show the result for confirmation; this function never writes data.
 */
export function suggestExerciseTaxonomy(name: string): ExerciseTaxonomySuggestion | null {
  const normalised = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const primaryMuscleGroup = inferMuscle(normalised);
  if (!primaryMuscleGroup) return null;

  return {
    primaryMuscleGroup,
    equipment: inferEquipment(normalised),
    movementPattern: inferMovement(normalised, primaryMuscleGroup),
  };
}
