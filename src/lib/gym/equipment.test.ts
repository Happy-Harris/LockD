import { beforeEach, describe, expect, it } from "vitest";
import { toGrams } from "@/domain/units";
import { usablePairs, withPlateCount } from "./equipment";
import { barbellSnap } from "./loads";
import { useGym } from "./store";

const kg = (n: number) => toGrams(n, "kg");

describe("withPlateCount", () => {
  const base = [
    { weightG: kg(20), count: 4 },
    { weightG: kg(5), count: 4 },
  ];

  it("changes one weight and keeps the list heaviest first", () => {
    expect(withPlateCount(base, kg(5), 8)).toEqual([
      { weightG: kg(20), count: 4 },
      { weightG: kg(5), count: 8 },
    ]);
    expect(withPlateCount(base, kg(25), 2).map((p) => p.weightG)).toEqual([kg(25), kg(20), kg(5)]);
  });

  it("removes a weight at zero and ignores an invalid weight", () => {
    expect(withPlateCount(base, kg(5), 0)).toEqual([{ weightG: kg(20), count: 4 }]);
    expect(withPlateCount(base, 0, 4)).toEqual(base);
    expect(withPlateCount(base, kg(1.25), -2)).toEqual(base);
  });

  it("counts loadable pairs, never an odd plate", () => {
    expect(usablePairs({ weightG: kg(20), count: 5 })).toBe(2);
  });
});

describe("the editor drives plate-aware rounding", () => {
  beforeEach(() => useGym.getState().resetAll());

  const snapNow = (grams: number) => {
    const { bars, plates, settings } = useGym.getState();
    return barbellSnap({ equipment: "barbell" }, bars, plates, settings)!(grams, "nearest");
  };

  it("uses the bar weight the lifter typed", () => {
    expect(snapNow(kg(60))).toBe(kg(60));
    const { settings } = useGym.getState();
    // A 20.3 kg bar: 60 kg is no longer a total the plates can make, so the snap moves off it.
    useGym.getState().updateBar(settings.defaultBarProfileId, { weightG: kg(20.3) });
    const after = snapNow(kg(60));
    expect(after).not.toBe(kg(60));
    expect(Math.abs(after - kg(60))).toBeLessThanOrEqual(kg(1));
  });

  it("stops offering a plate the lifter removed", () => {
    const { settings } = useGym.getState();
    const id = settings.defaultPlateInventoryId;
    for (const plate of useGym.getState().plates.find((p) => p.id === id)!.plates) {
      if (plate.weightG !== kg(20)) useGym.getState().setPlateCount(id, plate.weightG, 0);
    }
    // Only 20 kg plates (two pairs) on a 20 kg bar: 20, 60, 100 are the loads that exist.
    expect(snapNow(kg(59))).toBe(kg(60));
  });
});
