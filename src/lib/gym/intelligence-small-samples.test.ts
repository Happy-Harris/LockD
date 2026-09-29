import { describe, expect, it } from "vitest";
import { readVolumeResponse } from "./intelligence";

/**
 * Plan I-15 and D6 (confirmed by the owner): a volume "winner" needs at least 8 week pairs, at least 3 in each group and a
 * difference of at least 3% of the lift's e1RM, and always shows n.
 */
const BASE = 100_000;
const pair = (volume: number, next: number) => ({ volume, next, base: BASE });
/** `high` high-volume weeks that gained `gain` g, then `low` quiet weeks that gained nothing. */
const weeks = (high: number, low: number, gain: number) => [
  ...Array.from({ length: high }, () => pair(20, gain)),
  ...Array.from({ length: low }, () => pair(10, 0)),
];

describe("readVolumeResponse", () => {
  it("says nothing below eight week pairs", () => {
    expect(readVolumeResponse(weeks(4, 3, 9000))).toBeNull();
    expect(readVolumeResponse(weeks(4, 4, 9000))).not.toBeNull();
  });

  it("does not declare a winner on a 1 gram difference (the old behaviour did)", () => {
    const read = readVolumeResponse(weeks(4, 4, 1))!;
    expect(read.pattern).toBe(false);
    expect(read.text).toContain("No clear link");
    expect(read.text).toContain("from 8 weeks");
  });

  it("does not declare a winner when one group has fewer than three weeks", () => {
    expect(readVolumeResponse(weeks(2, 6, 9000))!.pattern).toBe(false);
  });

  it("names high-volume weeks when they gain 3% or more, and shows n", () => {
    const read = readVolumeResponse(weeks(4, 5, 4000))!;
    expect(read.pattern).toBe(true);
    expect(read.text).toContain("Higher-volume weeks");
    expect(read.text).toContain("from 9 weeks");
  });

  it("names quiet weeks the other way round", () => {
    const pairs = [
      ...Array.from({ length: 4 }, () => pair(20, 0)),
      ...Array.from({ length: 4 }, () => pair(10, 4000)),
    ];
    expect(readVolumeResponse(pairs)!.text).toContain("quieter volume weeks");
  });

  it("sits on the 3% edge: 3000 g of 100 kg counts, 2999 g does not", () => {
    expect(readVolumeResponse(weeks(4, 4, 3000))!.pattern).toBe(true);
    expect(readVolumeResponse(weeks(4, 4, 2999))!.pattern).toBe(false);
  });

  it("judges the gap against the lift's own e1RM, not a fixed weight", () => {
    const light = weeks(4, 4, 3000).map((row) => ({ ...row, base: 40_000 }));
    expect(readVolumeResponse(light)!.pattern).toBe(true); // 7.5% of a 40 kg lift
    const heavy = weeks(4, 4, 3000).map((row) => ({ ...row, base: 300_000 }));
    expect(readVolumeResponse(heavy)!.pattern).toBe(false); // 1% of a 300 kg lift
  });
});
