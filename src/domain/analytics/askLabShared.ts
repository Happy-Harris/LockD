import { MUSCLE_GROUPS } from "@/domain/taxonomy";
import type {
  MuscleGroup,
  OneRepMaxFormula,
  PersonalMuscleTargets,
  WeekStartDay,
} from "@/domain/types";
import type { WeightUnit } from "@/domain/units";
import type { EvidenceClaim } from "@/domain/evidence";
import type { LoggedEntry } from "./compute";
import type { MuscleSetEvidence, MuscleSetInsight } from "./muscleSets";
import type { WeeklyVerdict, WeeklyVerdictCopy } from "./weeklyVerdict";

export type AskLabTier = "computed" | "partial" | "explore";

export type AskLabDataIntent =
  "training_enough" | "muscle_contribution" | "verdict_why" | "getting_stronger" | "change_flags";

export type AskLabMatch = {
  claim: EvidenceClaim;
  score: number;
};

export type TrainingEnoughMuscleRow = {
  muscle: MuscleGroup;
  sets: number;
  targetMin?: number;
  targetMax?: number;
  targetSource?: "research" | "personal";
  state: MuscleSetInsight["state"];
};

export type MuscleContributionRow = {
  exerciseId: string;
  exerciseName: string;
  creditedSets: number;
  setCount: number;
  roles: Array<"primary" | "secondary">;
};

export type StrengthTrendRow = {
  exerciseId: string;
  exerciseName: string;
  sessionsWithE1rm: number;
  firstE1rmG: number;
  lastE1rmG: number;
  changePercent: number | null;
  lastBestWeightG: number | null;
};

export type AskLabPayload =
  | {
      kind: "training_enough";
      weekStartDate: string;
      weekEndDate: string;
      muscles: TrainingEnoughMuscleRow[];
      evidence: MuscleSetEvidence[];
      balanceId: string;
      balancePlain: string;
      insufficientMapping: boolean;
    }
  | {
      kind: "muscle_contribution";
      muscle: MuscleGroup;
      weekStartDate: string;
      weekEndDate: string;
      attributions: MuscleContributionRow[];
      evidence: MuscleSetEvidence[];
    }
  | {
      kind: "verdict_why";
      weekStart: WeekStartDay;
      subjectStartDate: string;
      subjectEndDate: string;
      verdict: WeeklyVerdict;
      copy: WeeklyVerdictCopy;
    }
  | {
      kind: "getting_stronger";
      windowKey: "12w";
      windowLabel: string;
      repCap: number;
      trends: StrengthTrendRow[];
    }
  | {
      kind: "change_flags";
      subjectStartDate: string;
      subjectEndDate: string;
      activeLabels: string[];
      receipts: string[];
      hasPartialStalls: boolean;
      hasPartialChecks: boolean;
    };

export type AskLabAnswer = {
  query: string;
  tier: AskLabTier;
  intent: AskLabDataIntent | null;
  /** Lead sentence for the UI. */
  call: string;
  matches: AskLabMatch[];
  payload?: AskLabPayload;
  /** What is known when the answer is only partial. */
  known?: string;
  /** What is missing for a full computed answer. */
  missing?: string;
  /** One concrete in-app next step. */
  nextStep?: string;
};

export type AskLabContext = {
  entries: readonly LoggedEntry[];
  weekStart: WeekStartDay;
  secondaryCredit: number;
  personalTargetBands?: PersonalMuscleTargets;
  formula: OneRepMaxFormula;
  includeWarmups: boolean;
  weightUnit?: WeightUnit;
  /** Wall-clock reference; defaults to now. */
  reference?: Date;
  /** User-picked goal lifts; empty or absent falls back to the inferred top lifts. */
  goalLiftIds?: readonly string[];
};

export const ASK_LAB_STARTERS: readonly { label: string; query: string }[] = [
  { label: "Training enough?", query: "Am I training enough?" },
  { label: "Chest contributors", query: "Which exercises contributed to chest?" },
  { label: "Verdict change", query: "Why did Weekly Verdict change?" },
  { label: "Getting stronger?", query: "Am I getting stronger?" },
  { label: "What to change?", query: "What should I change?" },
];

export const EXPLORE_BADGE = "Not computed — thinking with you";

const MUSCLE_ALIASES: ReadonlyArray<{ needle: string; muscle: MuscleGroup }> = [
  { needle: "abs", muscle: "core" },
  { needle: "abdominals", muscle: "core" },
  { needle: "pecs", muscle: "chest" },
  { needle: "pectorals", muscle: "chest" },
  { needle: "delts", muscle: "shoulders" },
  { needle: "deltoids", muscle: "shoulders" },
  { needle: "quadriceps", muscle: "quads" },
  { needle: "hams", muscle: "hamstrings" },
  { needle: "glute", muscle: "glutes" },
  { needle: "latissimus", muscle: "lats" },
  { needle: "trapezius", muscle: "traps" },
];

export function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function detectMuscleInQuery(query: string): MuscleGroup | null {
  const normalized = normalize(query);
  const groups = [...MUSCLE_GROUPS]
    .filter((muscle) => muscle !== "unmapped" && muscle !== "full body" && muscle !== "cardio")
    .sort((a, b) => b.length - a.length);
  for (const muscle of groups) {
    if (normalized.includes(muscle)) return muscle;
  }
  for (const alias of MUSCLE_ALIASES) {
    if (normalized.includes(alias.needle)) return alias.muscle;
  }
  return null;
}
