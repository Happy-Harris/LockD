import type { MuscleGroup } from "@/domain/types";

/** Weekly hard-set landmarks (MEV / MAV / MRV) for a typical intermediate split. */
export const VOLUME_LANDMARKS: Partial<Record<MuscleGroup, { mev: number; mav: number; mrv: number }>> = {
  chest: { mev: 8, mav: 16, mrv: 22 },
  lats: { mev: 8, mav: 16, mrv: 22 },
  back: { mev: 8, mav: 18, mrv: 25 },
  shoulders: { mev: 8, mav: 16, mrv: 22 },
  biceps: { mev: 6, mav: 14, mrv: 20 },
  triceps: { mev: 6, mav: 14, mrv: 20 },
  quads: { mev: 8, mav: 16, mrv: 22 },
  hamstrings: { mev: 6, mav: 12, mrv: 18 },
  glutes: { mev: 6, mav: 14, mrv: 20 },
  calves: { mev: 6, mav: 12, mrv: 18 },
  core: { mev: 4, mav: 10, mrv: 16 },
  traps: { mev: 4, mav: 10, mrv: 16 },
};

export type LandmarkBand = "below" | "mev" | "mav" | "mrv" | "over";

export function classifyVolume(muscle: MuscleGroup, hardSets: number): LandmarkBand {
  const marks = VOLUME_LANDMARKS[muscle];
  if (!marks) return "mev";
  if (hardSets < marks.mev) return "below";
  if (hardSets < marks.mav) return "mev";
  if (hardSets < marks.mrv) return "mav";
  if (hardSets === marks.mrv) return "mrv";
  return "over";
}

export function landmarkLabel(band: LandmarkBand): string {
  if (band === "below") return "Under MEV";
  if (band === "mev") return "MEV";
  if (band === "mav") return "MAV";
  if (band === "mrv") return "MRV";
  return "Over MRV";
}
