import { defaultQuickIncrementG } from "@/domain/units";
import type { AppSettings } from "@/domain/types";

export const defaultSettings = (): AppSettings => ({
  unitSystem: "metric",
  oneRepMaxFormula: "epley",
  intensityMode: "rpe",
  weekStartDay: "monday",
  quickIncrementG: defaultQuickIncrementG("metric"),
  defaultRestSeconds: 120,
  restTimerAutoStart: true,
  restTimerSound: true,
  excludeWarmupsFromAnalytics: true,
  secondaryMuscleCredit: 0.5,
  goalLiftIds: ["seed-bench-press", "seed-back-squat", "seed-conventional-deadlift"],
  defaultBarProfileId: "seed-bar-olympic-kg",
  defaultPlateInventoryId: "seed-plates-kg",
  themeMode: "dark",
  accentTheme: "stamp",
  goalLens: "powerbuilding",
  presentationMode: "loud",
  demoLoaded: false,
});
