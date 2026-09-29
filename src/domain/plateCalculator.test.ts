import { describe, expect, it } from "vitest";
import { calculatePlates, reachableTotals } from "./plateCalculator";
import { toGrams } from "./units";
import type { PlateDenomination } from "./types";

const kg = (value: number) => toGrams(value, "kg");
const lb = (value: number) => toGrams(value, "lb");

const fullKgGym: PlateDenomination[] = [
  { weightG: kg(25), count: 4 },
  { weightG: kg(20), count: 4 },
  { weightG: kg(15), count: 2 },
  { weightG: kg(10), count: 4 },
  { weightG: kg(5), count: 4 },
  { weightG: kg(2.5), count: 4 },
  { weightG: kg(1.25), count: 4 },
];

const perSideMap = (result: ReturnType<typeof calculatePlates>) =>
  Object.fromEntries(result.perSide.map((item) => [item.weightG, item.countPerSide]));

describe("exact loading", () => {
  it("solves a standard 100 kg bar with the fewest plates, heaviest first", () => {
    const result = calculatePlates({
      targetTotalG: kg(100),
      barWeightG: kg(20),
      plates: fullKgGym,
    });
    expect(result.status).toBe("exact");
    expect(result.achievedTotalG).toBe(kg(100));
    // 40 kg per side in two plates; the documented tie-break loads the heavier plate first.
    expect(result.totalPlates).toBe(4);
    expect(result.perSide.map((item) => item.weightG)).toEqual([kg(25), kg(15)]);
  });

  it("prefers the fewest plates", () => {
    const result = calculatePlates({ targetTotalG: kg(70), barWeightG: kg(20), plates: fullKgGym });
    expect(result.status).toBe("exact");
    // 25 per side beats 20 + 5 or 15 + 10.
    expect(perSideMap(result)).toEqual({ [kg(25)]: 1 });
  });

  it("handles pound inventories", () => {
    const plates: PlateDenomination[] = [
      { weightG: lb(45), count: 4 },
      { weightG: lb(25), count: 2 },
      { weightG: lb(10), count: 4 },
      { weightG: lb(5), count: 4 },
      { weightG: lb(2.5), count: 2 },
    ];
    const result = calculatePlates({ targetTotalG: lb(225), barWeightG: lb(45), plates });
    expect(result.status).toBe("exact");
    expect(perSideMap(result)).toEqual({ [lb(45)]: 2 });
  });

  it("adds collar weight to both sides", () => {
    const result = calculatePlates({
      targetTotalG: kg(105),
      barWeightG: kg(20),
      collarWeightG: kg(2.5),
      plates: fullKgGym,
    });
    expect(result.status).toBe("exact");
    expect(result.achievedTotalG).toBe(kg(105));
  });
});

describe("finite inventory", () => {
  it("beats a greedy descent when the greedy plate strands the target", () => {
    // Per side target 35 kg. Greedy takes 25, then cannot make 10 (none left) and lands
    // at 25 + 5 + 2.5 = 32.5. The correct answer is 20 + 15.
    const plates: PlateDenomination[] = [
      { weightG: kg(25), count: 2 },
      { weightG: kg(20), count: 2 },
      { weightG: kg(15), count: 2 },
      { weightG: kg(5), count: 2 },
      { weightG: kg(2.5), count: 2 },
    ];
    const result = calculatePlates({ targetTotalG: kg(90), barWeightG: kg(20), plates });
    expect(result.status).toBe("exact");
    expect(perSideMap(result)).toEqual({ [kg(20)]: 1, [kg(15)]: 1 });
  });

  it("treats counts as physical plates, not pairs", () => {
    // Three 20 kg plates -> one usable pair only.
    const plates: PlateDenomination[] = [{ weightG: kg(20), count: 3 }];
    const result = calculatePlates({ targetTotalG: kg(100), barWeightG: kg(20), plates });
    expect(result.status).toBe("closest_lower");
    expect(result.achievedTotalG).toBe(kg(60));
  });

  it("ignores a single odd plate entirely", () => {
    const plates: PlateDenomination[] = [{ weightG: kg(20), count: 1 }];
    const result = calculatePlates({ targetTotalG: kg(60), barWeightG: kg(20), plates });
    expect(result.status).toBe("no_plates");
    expect(result.achievedTotalG).toBe(kg(20));
  });

  it("merges duplicate denominations", () => {
    const plates: PlateDenomination[] = [
      { weightG: kg(20), count: 1 },
      { weightG: kg(20), count: 1 },
    ];
    const result = calculatePlates({ targetTotalG: kg(60), barWeightG: kg(20), plates });
    expect(result.status).toBe("exact");
  });
});

describe("closest lower results", () => {
  it("reports the shortfall when the target is unreachable", () => {
    const result = calculatePlates({
      targetTotalG: kg(101),
      barWeightG: kg(20),
      plates: fullKgGym,
    });
    expect(result.status).toBe("closest_lower");
    expect(result.achievedTotalG).toBe(kg(100));
    expect(result.differenceG).toBe(kg(100) - kg(101));
  });

  it("handles an odd remainder that cannot be split", () => {
    const plates: PlateDenomination[] = [{ weightG: kg(5), count: 10 }];
    const result = calculatePlates({ targetTotalG: kg(35), barWeightG: kg(20), plates });
    // 15 kg of plates cannot be balanced: 5 kg per side plus a stranded 5 kg.
    expect(result.achievedTotalG).toBe(kg(30));
    expect(result.status).toBe("closest_lower");
  });
});

describe("edge cases", () => {
  it("reports a bare bar target", () => {
    const result = calculatePlates({ targetTotalG: kg(20), barWeightG: kg(20), plates: fullKgGym });
    expect(result.status).toBe("bar_only");
    expect(result.perSide).toEqual([]);
    expect(result.differenceG).toBe(0);
  });

  it("reports targets below the bar", () => {
    const result = calculatePlates({ targetTotalG: kg(10), barWeightG: kg(20), plates: fullKgGym });
    expect(result.status).toBe("below_bar");
    expect(result.achievedTotalG).toBe(kg(20));
  });

  it("rejects a negative target", () => {
    expect(
      calculatePlates({ targetTotalG: -1, barWeightG: kg(20), plates: fullKgGym }).status,
    ).toBe("invalid");
  });

  it("handles an empty inventory", () => {
    const result = calculatePlates({ targetTotalG: kg(60), barWeightG: kg(20), plates: [] });
    expect(result.status).toBe("no_plates");
  });

  it("ignores zero and negative denominations", () => {
    const result = calculatePlates({
      targetTotalG: kg(60),
      barWeightG: kg(20),
      plates: [
        { weightG: 0, count: 10 },
        { weightG: -5_000, count: 10 },
        { weightG: kg(20), count: 2 },
      ],
    });
    expect(result.status).toBe("exact");
  });

  it("supports a zero-weight custom bar", () => {
    const result = calculatePlates({ targetTotalG: kg(40), barWeightG: 0, plates: fullKgGym });
    expect(result.status).toBe("exact");
    expect(result.achievedTotalG).toBe(kg(40));
  });

  it("handles decimal micro-plates", () => {
    const plates: PlateDenomination[] = [
      ...fullKgGym,
      { weightG: kg(0.5), count: 2 },
      { weightG: kg(0.25), count: 2 },
    ];
    const result = calculatePlates({ targetTotalG: kg(101.5), barWeightG: kg(20), plates });
    expect(result.status).toBe("exact");
    expect(result.achievedTotalG).toBe(kg(101.5));
  });
});

describe("property: results are always balanced, affordable and never over target", () => {
  const denominations = [kg(25), kg(20), kg(15), kg(10), kg(5), kg(2.5), kg(1.25)];

  it("holds across randomised inventories and targets", () => {
    let seed = 20260916;
    const random = () => {
      // Deterministic LCG so a failure is reproducible.
      seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return seed / 4_294_967_296;
    };

    for (let iteration = 0; iteration < 400; iteration += 1) {
      const plates = denominations
        .filter(() => random() > 0.25)
        .map((weightG) => ({ weightG, count: Math.floor(random() * 9) }));
      const barWeightG = kg([0, 10, 15, 20, 25][Math.floor(random() * 5)] ?? 20);
      const targetTotalG = Math.round(random() * kg(300));

      const result = calculatePlates({ targetTotalG, barWeightG, plates });

      // never exceeds the target (beyond the documented 4 g conversion tolerance)
      // unless the bare bar alone already does
      if (result.status !== "below_bar" && result.status !== "invalid") {
        expect(result.achievedTotalG).toBeLessThanOrEqual(targetTotalG + 4);
      }
      // the stack is symmetric and affordable
      let sum = barWeightG;
      for (const item of result.perSide) {
        const owned = plates.find((plate) => plate.weightG === item.weightG)?.count ?? 0;
        expect(item.countPerSide * 2).toBeLessThanOrEqual(owned);
        sum += item.weightG * item.countPerSide * 2;
      }
      expect(sum).toBe(result.achievedTotalG);
    }
  });
});

describe("reachableTotals", () => {
  it("lists ascending buildable totals starting at the bare bar", () => {
    const totals = reachableTotals({ barWeightG: kg(20), plates: fullKgGym }, kg(120));
    expect(totals[0]).toBe(kg(20));
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    expect(totals).toContain(kg(100));
    expect(totals.every((total) => total <= kg(120))).toBe(true);
  });
});
