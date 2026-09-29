import { describe, expect, it } from "vitest";
import { seedExercises } from "@/lib/gym/seed";
import { suggestExerciseTaxonomy } from "./exerciseTaxonomy";

// The suggester only ever proposes; the caller must show it for confirmation (number honesty:
// no silent muscle mapping). These pin that contract against Lock'd's own library.
describe("suggestExerciseTaxonomy — Lock'd contract", () => {
  it("returns null rather than guessing when nothing in the name is recognised", () => {
    expect(suggestExerciseTaxonomy("Zercher Thing")).toBeNull();
    expect(suggestExerciseTaxonomy("")).toBeNull();
    expect(suggestExerciseTaxonomy("   ")).toBeNull();
  });

  it("never proposes the 'unmapped' placeholder as a muscle", () => {
    for (const exercise of seedExercises("2026-01-01T00:00:00.000Z")) {
      expect(suggestExerciseTaxonomy(exercise.name)?.primaryMuscleGroup).not.toBe("unmapped");
    }
  });

  it("says 'other' for equipment when the name gives no cue, instead of guessing", () => {
    expect(suggestExerciseTaxonomy("Back Squat")?.equipment).toBe("other");
    expect(suggestExerciseTaxonomy("Back Squat (Barbell)")?.equipment).toBe("barbell");
  });

  it("agrees with the seed library's muscle wherever it answers, bar two arguable calls", () => {
    // Measured on the 66-exercise seed library: 49 names get a suggestion, 47 match the seed's
    // muscle. The two that differ are judgement calls, pinned so a change is visible.
    const differ = seedExercises("2026-01-01T00:00:00.000Z")
      .filter((row) => {
        const suggestion = suggestExerciseTaxonomy(row.name);
        return suggestion && suggestion.primaryMuscleGroup !== row.primaryMuscleGroup;
      })
      .map((row) => row.name);
    expect(differ).toEqual(["Sumo Deadlift", "Close-Grip Bench Press"]);
  });
});
