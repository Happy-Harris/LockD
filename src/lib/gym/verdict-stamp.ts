import type { WeeklyVerdict } from "@/domain/analytics/weeklyVerdict";

/**
 * The word on the stamp, only when the verdict has a direction to name. Not enough weeks, a return
 * after a break and a deload-shaped week get no direction stamp (a deload reads as "LIGHT"), so a
 * stamp is never a call the log cannot back.
 */
export function stampWord(verdict: WeeklyVerdict): string | null {
  if (verdict.state === "deload") return "LIGHT";
  if (verdict.state !== "full" || !verdict.direction) return null;
  switch (verdict.direction.band) {
    case "big_jump":
    case "up":
      return "UP";
    case "down":
    case "well_down":
      return "DOWN";
    default:
      return "HOLD";
  }
}
