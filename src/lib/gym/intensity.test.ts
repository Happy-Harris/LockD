import { describe, expect, it } from "vitest";
import {
  intensityChoices,
  intensityLabel,
  intensityPatch,
  intensityTarget,
  intensityTargetLabel,
} from "./intensity";

describe("intensity pick (I-31)", () => {
  it("offers RPE 6 to 10 in halves, RIR 0 to 5, and nothing when off", () => {
    expect(intensityChoices("rpe")).toHaveLength(9);
    expect(intensityChoices("rir")).toEqual([0, 1, 2, 3, 4, 5]);
    expect(intensityChoices("none")).toEqual([]);
  });

  it("writes the field for the mode and leaves the other alone", () => {
    expect(intensityPatch("rir", {}, 2)).toEqual({ rir: 2 });
    expect(intensityPatch("rpe", { rir: 1 }, 8.5)).toEqual({ rpe: 8.5 });
  });

  it("clears on a second tap of the same value, and RIR 0 is a real value", () => {
    expect(intensityPatch("rir", { rir: 2 }, 2)).toEqual({ rir: undefined });
    expect(intensityPatch("rir", {}, 0)).toEqual({ rir: 0 });
    expect(intensityLabel("rir", { rir: 0 })).toBe("RIR 0");
  });

  it("shows a missing value as a dash, never zero", () => {
    expect(intensityLabel("rir", {})).toBe("RIR —");
    expect(intensityLabel("rpe", { rir: 3 })).toBe("RPE —");
  });
});

describe("routine effort targets", () => {
  const routine = { targetRpe: 8, targetRir: 2 };

  it("follows the lifter's mode and never crosses RPE with RIR", () => {
    expect(intensityTarget("rir", routine)).toBe(2);
    expect(intensityTarget("rpe", routine)).toBe(8);
    expect(intensityTarget("none", routine)).toBeUndefined();
    expect(intensityTargetLabel("rir", routine)).toBe("target RIR 2");
    expect(intensityTargetLabel("rpe", routine)).toBe("target RPE 8");
  });

  it("shows nothing when the routine sets none, and keeps a target of 0", () => {
    expect(intensityTargetLabel("rir", {})).toBeUndefined();
    expect(intensityTargetLabel("rir", undefined)).toBeUndefined();
    expect(intensityTargetLabel("rpe", { targetRir: 2 })).toBeUndefined();
    expect(intensityTargetLabel("rir", { targetRir: 0 })).toBe("target RIR 0");
  });
});
