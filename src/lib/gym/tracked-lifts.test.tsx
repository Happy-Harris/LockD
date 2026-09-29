// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useGymDerived } from "./hooks";
import { LENSES } from "./lenses";
import { useGym } from "./store";

beforeEach(() => {
  useGym.getState().resetAll();
  useGym.getState().completeOnboarding({ loadDemo: true, unitSystem: "metric" });
});

describe("which lifts are tracked", () => {
  it("are the lifter's own goal lifts under every lens; the lens never swaps them", () => {
    useGym.getState().updateSettings({ goalLiftIds: ["seed-overhead-press", "seed-barbell-row"] });
    for (const lens of LENSES) {
      useGym.getState().updateSettings({ goalLens: lens.id });
      const { result } = renderHook(() => useGymDerived());
      expect(
        result.current.board.map((row) => row.exerciseId),
        lens.id,
      ).toEqual(["seed-overhead-press", "seed-barbell-row"]);
    }
  });

  it("fall back to the most-trained lifts when none are picked, and say so in the verdict", () => {
    useGym.getState().updateSettings({ goalLiftIds: [] });
    const { result } = renderHook(() => useGymDerived());
    expect(result.current.board.length).toBeGreaterThan(0);
    expect(result.current.board.length).toBeLessThanOrEqual(3);
    expect(result.current.verdict.goalLiftSource).toBe("inferred");
  });
});
