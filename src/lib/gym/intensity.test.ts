import { describe, expect, it } from "vitest";
import { intensityChoices, intensityLabel, intensityPatch } from "./intensity";

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
