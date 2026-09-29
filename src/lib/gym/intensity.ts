import type { IntensityMode, WorkoutSet } from "@/domain/types";

/** RPE is picked from 6 to 10 in half steps; RIR from 0 to 5 whole reps. Nothing is converted between them. */
export const RPE_CHOICES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;
export const RIR_CHOICES = [0, 1, 2, 3, 4, 5] as const;

export function intensityChoices(mode: IntensityMode): readonly number[] {
  return mode === "rir" ? RIR_CHOICES : mode === "rpe" ? RPE_CHOICES : [];
}

export function intensityValue(
  mode: IntensityMode,
  set: Pick<WorkoutSet, "rpe" | "rir">,
): number | undefined {
  return mode === "rir" ? set.rir : mode === "rpe" ? set.rpe : undefined;
}

/** Button text. A set with no value says so ("—"); it is never shown as 0. */
export function intensityLabel(mode: IntensityMode, set: Pick<WorkoutSet, "rpe" | "rir">): string {
  const value = intensityValue(mode, set);
  return `${mode === "rir" ? "RIR" : "RPE"} ${value ?? "—"}`;
}

/** Picking the current value again clears it, so a wrong tap is one tap to undo. */
export function intensityPatch(
  mode: IntensityMode,
  set: Pick<WorkoutSet, "rpe" | "rir">,
  picked: number,
): Partial<WorkoutSet> {
  const clear = intensityValue(mode, set) === picked;
  if (mode === "rir") return { rir: clear ? undefined : picked };
  if (mode === "rpe") return { rpe: clear ? undefined : picked };
  return {};
}

/** The effort the routine asks for, in the lifter's current mode. Undefined when the routine sets none: nothing is invented. */
export function intensityTarget(
  mode: IntensityMode,
  prescription: { targetRpe?: number; targetRir?: number } | undefined,
): number | undefined {
  if (mode === "rir") return prescription?.targetRir;
  if (mode === "rpe") return prescription?.targetRpe;
  return undefined;
}

export function intensityTargetLabel(
  mode: IntensityMode,
  prescription: { targetRpe?: number; targetRir?: number } | undefined,
): string | undefined {
  const value = intensityTarget(mode, prescription);
  return value == null ? undefined : `target ${mode === "rir" ? "RIR" : "RPE"} ${value}`;
}
