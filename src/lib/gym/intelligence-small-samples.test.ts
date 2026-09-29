import { describe, expect, it } from "vitest";
import { readVolumeResponse } from "./intelligence";

/** Plan I-15: a volume "winner" needs enough weeks in each group and a real gap, and always shows n. */
const pair = (volume: number, next: number) => ({ volume, next });

describe("readVolumeResponse", () => {
  it("says nothing below six week pairs", () => {
    expect(
      readVolumeResponse([pair(10, 0), pair(20, 1000), pair(10, 0), pair(20, 1000)]),
    ).toBeNull();
  });

  it("does not declare a winner on a 1 gram difference (the old behaviour did)", () => {
    const pairs = [pair(20, 1), pair(20, 1), pair(20, 1), pair(10, 0), pair(10, 0), pair(10, 0)];
    const read = readVolumeResponse(pairs)!;
    expect(read.pattern).toBe(false);
    expect(read.text).toContain("No clear link");
    expect(read.text).toContain("from 6 weeks");
  });

  it("does not declare a winner when one group has fewer than three weeks", () => {
    const pairs = [pair(50, 9000), pair(10, 0), pair(10, 0), pair(10, 0), pair(10, 0), pair(10, 0)];
    expect(readVolumeResponse(pairs)!.pattern).toBe(false);
  });

  it("names high-volume weeks when they are followed by 2.5 kg or more of extra e1RM, and shows n", () => {
    const pairs = [
      pair(20, 3000),
      pair(20, 3000),
      pair(20, 3000),
      pair(10, 0),
      pair(10, 0),
      pair(10, 0),
      pair(10, 0),
    ];
    const read = readVolumeResponse(pairs)!;
    expect(read.pattern).toBe(true);
    expect(read.text).toContain("Higher-volume weeks");
    expect(read.text).toContain("from 7 weeks");
  });

  it("names quiet weeks the other way round", () => {
    const pairs = [
      pair(20, 0),
      pair(20, 0),
      pair(20, 0),
      pair(10, 3000),
      pair(10, 3000),
      pair(10, 3000),
    ];
    expect(readVolumeResponse(pairs)!.text).toContain("quieter volume weeks");
  });

  it("sits exactly on the threshold: 2500 g counts, 2499 g does not", () => {
    const build = (gap: number) => [
      pair(20, gap),
      pair(20, gap),
      pair(20, gap),
      pair(10, 0),
      pair(10, 0),
      pair(10, 0),
    ];
    expect(readVolumeResponse(build(2500))!.pattern).toBe(true);
    expect(readVolumeResponse(build(2499))!.pattern).toBe(false);
  });
});
