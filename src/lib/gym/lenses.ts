import type { GoalLens } from "@/domain/types";

export interface LensDef {
  id: GoalLens;
  label: string;
  kicker: string;
  blurb: string;
  today: Array<"verdict" | "goals" | "progression" | "volume" | "recovery" | "relative" | "skills" | "moments">;
  recordKind: "e1rm" | "weight" | "reps" | "volume";
  skillIds: string[];
}

export const LENSES: LensDef[] = [
  {
    id: "powerbuilding",
    label: "Powerbuilding",
    kicker: "Heavy and jacked",
    blurb: "The big three stay on the board. Volume still has to land.",
    today: ["goals", "progression", "volume", "moments"],
    recordKind: "e1rm",
    skillIds: ["seed-bench-press", "seed-back-squat", "seed-conventional-deadlift"],
  },
  {
    id: "strength",
    label: "Strength",
    kicker: "The heavy work",
    blurb: "Estimated 1RMs, stalls, and the next kilo. Volume is support.",
    today: ["goals", "progression", "verdict", "moments"],
    recordKind: "e1rm",
    skillIds: ["seed-bench-press", "seed-back-squat", "seed-conventional-deadlift", "seed-overhead-press"],
  },
  {
    id: "hypertrophy",
    label: "Hypertrophy",
    kicker: "Sets that grow",
    blurb: "Weekly hard sets by muscle, recovery, and whether the volume actually paid.",
    today: ["volume", "recovery", "progression", "verdict"],
    recordKind: "volume",
    skillIds: [],
  },
  {
    id: "calisthenics",
    label: "Calisthenics",
    kicker: "Own the body",
    blurb: "Rep PRs, relative strength, and the skills that don't need a bar.",
    today: ["skills", "relative", "progression", "moments"],
    recordKind: "reps",
    skillIds: ["seed-pull-up", "seed-chin-up", "seed-dip", "seed-push-up"],
  },
  {
    id: "hybrid",
    label: "Hybrid",
    kicker: "Lift and last",
    blurb: "Recovery first, then the heavy work, then anything that keeps you durable.",
    today: ["recovery", "verdict", "goals", "progression"],
    recordKind: "e1rm",
    skillIds: ["seed-bench-press", "seed-back-squat", "seed-kettlebell-swing"],
  },
  {
    id: "general",
    label: "General",
    kicker: "The whole file",
    blurb: "Same underlying truth. No single lift gets to own the dashboard.",
    today: ["verdict", "progression", "recovery", "moments"],
    recordKind: "e1rm",
    skillIds: [],
  },
];

export function lensDef(id: GoalLens): LensDef {
  return LENSES.find((row) => row.id === id) ?? LENSES[5]!;
}

export function lensShows(id: GoalLens, block: LensDef["today"][number]): boolean {
  return lensDef(id).today.includes(block);
}
