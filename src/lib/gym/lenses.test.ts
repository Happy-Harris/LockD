import { describe, expect, it } from "vitest";
import { LENSES, verdictFraming } from "./lenses";

describe("how each preset frames the weekly verdict", () => {
  it("maps every preset to one of the three framings", () => {
    expect(Object.fromEntries(LENSES.map((lens) => [lens.id, verdictFraming(lens.id)]))).toEqual({
      powerbuilding: "build",
      strength: "strength",
      hypertrophy: "build",
      calisthenics: "build",
      hybrid: "maintain",
      general: "build",
    });
  });
});
