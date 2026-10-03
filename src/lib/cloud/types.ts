import type {
  AppSettings,
  BarProfile,
  BodyMeasurement,
  ClipMeta,
  EraName,
  Exercise,
  ExerciseLesson,
  MachineSetup,
  NamedPr,
  PlateInventory,
  Program,
  ProgramExercise,
  ProgramFile,
  ProgramSession,
  ProgramWeek,
  Template,
  TemplateExercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "@/domain/types";
import type { TrainingMoment } from "@/lib/gym/moments";
import type { YearReceipt } from "@/lib/gym/wrapped";
import type { LifetimeReceipt } from "@/lib/receipt/web-receipt";
import type { WeightUnit } from "@/domain/units";

export type CloudGym = {
  exercises: Exercise[];
  templates: Template[];
  templateExercises: TemplateExercise[];
  workouts: Workout[];
  workoutExercises: WorkoutExercise[];
  workoutSets: WorkoutSet[];
  measurements: BodyMeasurement[];
  plates: PlateInventory[];
  bars: BarProfile[];
  settings: AppSettings;
  labLast: { askedAt: string; text: string } | null;
  programs: Program[];
  programWeeks: ProgramWeek[];
  programSessions: ProgramSession[];
  programExercises: ProgramExercise[];
  eraNames: EraName[];
  machineSetups: MachineSetup[];
  lessons: ExerciseLesson[];
  namedPrs: NamedPr[];
  clips: ClipMeta[];
};

export type CloudStatus = "guest" | "pulling" | "synced" | "saving" | "error";

export type ShareKind = "moment" | "receipt" | "wrapped" | "program" | "lifetime";

export type ShareMomentPayload = {
  kind: "moment";
  athlete: string;
  handle?: string;
  unit: WeightUnit;
  moment: TrainingMoment;
};

export type ShareReceiptLine = {
  name: string;
  sets: string;
  pr?: boolean;
};

export type ShareReceiptPayload = {
  kind: "receipt";
  athlete: string;
  handle?: string;
  workoutName: string;
  date: string;
  durationSec: number;
  hardSets: number;
  tonnageLabel: string;
  lines: ShareReceiptLine[];
  prs: string[];
  eraName?: string;
};

export type ShareWrappedPayload = {
  kind: "wrapped";
  athlete: string;
  handle?: string;
  unit: WeightUnit;
  receipt: YearReceipt;
};

export type ShareProgramPayload = {
  kind: "program";
  athlete: string;
  handle?: string;
  file: ProgramFile;
};

/** Opp 9: the lifetime receipt (Opp 2), published. Only the receipt's own numbers; never the log it was read from. */
export type ShareLifetimePayload = {
  kind: "lifetime";
  athlete: string;
  handle?: string;
  unit: WeightUnit;
  receipt: LifetimeReceipt;
};

export type SharePayload =
  | ShareMomentPayload
  | ShareReceiptPayload
  | ShareWrappedPayload
  | ShareProgramPayload
  | ShareLifetimePayload;

export type PublicShare = {
  id: string;
  kind: ShareKind;
  title: string;
  createdAt: string;
  payload: SharePayload;
};

export type LockerMoment = {
  id: string;
  title: string;
  kicker: string;
  date: string;
  detail: string;
  valueLabel?: string;
  eraName?: string;
};

export type LockerCard = {
  handle: string;
  displayName: string;
  bio: string;
  lens?: string;
  era?: string;
  streak: number;
  sessions: number;
  relative: Array<{ name: string; ratio: number }>;
  moments: LockerMoment[];
};

export type CloudProfile = {
  handle: string;
  displayName: string;
  bio: string;
  lens?: string;
  isPublic: boolean;
  privacyNoticePending?: boolean;
};

export type LabHistoryNote = {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
};
