import { describe, expect, it } from "vitest";
import {
  SEED_LIBRARY_VERSION,
  SEED_LIBRARY_VERSION_UNTRACKED,
  seedExerciseId,
  seedExercises,
  seedExercisesAddedAfter,
  slugify,
  topUpSeedLibrary,
} from "./seed";

const NOW = "2026-09-29T12:00:00.000Z";

describe("the seed library", () => {
  const all = seedExercises(NOW);

  it("has 93 exercises with unique ids and names", () => {
    expect(all).toHaveLength(93);
    expect(new Set(all.map((e) => e.id)).size).toBe(93);
    expect(new Set(all.map((e) => slugify(e.name))).size).toBe(93);
  });

  it("keeps the ids the first 66 always had", () => {
    for (const name of ["Back Squat", "Bench Press", "Farmer's Carry", "Jump Rope"]) {
      expect(all.map((e) => e.id)).toContain(seedExerciseId(name));
    }
    expect(seedExerciseId("Farmer's Carry")).toBe("seed-farmers-carry");
  });

  it("classifies every exercise: no unmapped muscle, and a real tracking type", () => {
    for (const exercise of all) {
      expect(exercise.primaryMuscleGroup, exercise.name).not.toBe("unmapped");
      expect(exercise.secondaryMuscleGroups, exercise.name).not.toContain(
        exercise.primaryMuscleGroup,
      );
    }
  });

  it("marks the one-sided exercises, and tracks assisted lifts by the assistance", () => {
    const byName = new Map(all.map((e) => [e.name, e]));
    expect(byName.get("Single-Arm Dumbbell Shoulder Press")?.unilateral).toBe(true);
    expect(byName.get("Assisted Pull-Up")?.trackingType).toBe("assisted_weight");
    expect(byName.get("Assisted Dip")?.trackingType).toBe("assisted_weight");
    expect(byName.get("Side Plank")?.trackingType).toBe("duration");
  });

  it("is what version 3 of the library adds to version 2", () => {
    const added = seedExercisesAddedAfter(SEED_LIBRARY_VERSION_UNTRACKED, NOW);
    expect(SEED_LIBRARY_VERSION).toBe(3);
    expect(added).toHaveLength(27);
    expect(seedExercisesAddedAfter(SEED_LIBRARY_VERSION, NOW)).toEqual([]);
    expect(all.filter((e) => !added.some((a) => a.id === e.id))).toHaveLength(66);
  });
});

describe("topping up an existing install", () => {
  const base = seedExercises(NOW).filter(
    (e) => !seedExercisesAddedAfter(SEED_LIBRARY_VERSION_UNTRACKED, NOW).some((a) => a.id === e.id),
  );

  it("adds exactly what version 3 added to a log that predates versions", () => {
    const added = topUpSeedLibrary(base, undefined, NOW);
    expect(added).toHaveLength(27);
    expect(added.map((e) => e.name)).toContain("Rack Pull");
  });

  it("adds nothing once the version is applied", () => {
    expect(topUpSeedLibrary(base, SEED_LIBRARY_VERSION, NOW)).toEqual([]);
  });

  it("does not bring back an exercise the lifter removed, once the version is applied", () => {
    const withoutRackPull = seedExercises(NOW).filter((e) => e.name !== "Rack Pull");
    expect(topUpSeedLibrary(withoutRackPull, SEED_LIBRARY_VERSION, NOW)).toEqual([]);
  });

  it("leaves an exercise the lifter archived or renamed exactly as it is", () => {
    const seeded = seedExercisesAddedAfter(2, NOW).find((e) => e.name === "Rack Pull")!;
    const renamed = { ...seeded, name: "Deficit Pulls", isArchived: true };
    const added = topUpSeedLibrary([...base, renamed], undefined, NOW);
    // Same id under another name: not added a second time, and the lifter's row is not touched.
    expect(added.map((e) => e.id)).not.toContain(seeded.id);
    expect(added.map((e) => e.name)).not.toContain("Rack Pull");
    expect(added).toHaveLength(26);
  });

  it("does not duplicate a custom exercise that has the same name", () => {
    const custom = { ...base[0]!, id: "u-1", name: "box squat", isCustom: true };
    const added = topUpSeedLibrary([...base, custom], undefined, NOW);
    expect(added.map((e) => e.name)).not.toContain("Box Squat");
    expect(added).toHaveLength(26);
  });

  it("does not change what it is given", () => {
    const input = [...base];
    topUpSeedLibrary(input, undefined, NOW);
    expect(input).toHaveLength(66);
  });
});
