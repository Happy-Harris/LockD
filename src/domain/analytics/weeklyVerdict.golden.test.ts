import { describe, expect, it } from "vitest";
import {
  DEFERRED_GOLDEN_FIXTURE_NAMES,
  GOLDEN_OPTIONS,
  SHIPPED_GOLDEN_FIXTURES,
  type VerdictFixture,
} from "./weeklyVerdict.fixtures";
import { weeklyVerdict } from "./weeklyVerdict";

function runFixture(fixture: VerdictFixture) {
  return weeklyVerdict(
    fixture.entries,
    GOLDEN_OPTIONS,
    fixture.weekStart,
    new Date(fixture.reference),
  );
}

describe("Weekly Verdict golden fixtures (shipped tranche)", () => {
  it("ships a solid first tranche and documents deferred cases", () => {
    expect(SHIPPED_GOLDEN_FIXTURES.length).toBeGreaterThanOrEqual(30);
    expect(DEFERRED_GOLDEN_FIXTURE_NAMES.length).toBeGreaterThan(0);
    expect(
      SHIPPED_GOLDEN_FIXTURES.length + DEFERRED_GOLDEN_FIXTURE_NAMES.length,
    ).toBeGreaterThanOrEqual(50);
  });

  it("covers Sat/Sun/Mon week starts, 23:50 local, same-span pulse, and never-partial-vs-full", () => {
    const names = SHIPPED_GOLDEN_FIXTURES.map((fixture) => fixture.name);
    expect(names.some((name) => name.includes("Monday"))).toBe(true);
    expect(names.some((name) => name.includes("Sunday"))).toBe(true);
    expect(names.some((name) => name.includes("Saturday"))).toBe(true);
    expect(names.some((name) => name.includes("23:50"))).toBe(true);
    expect(names.some((name) => name.includes("same elapsed span"))).toBe(true);
    expect(SHIPPED_GOLDEN_FIXTURES.some((fixture) => fixture.expected.neverPartialVsFull)).toBe(
      true,
    );
    expect(SHIPPED_GOLDEN_FIXTURES.some((fixture) => fixture.expected.pulseNull)).toBe(true);
  });

  it.each(SHIPPED_GOLDEN_FIXTURES.map((fixture) => [fixture.name, fixture] as const))(
    "%s",
    (_name, fixture) => {
      const result = runFixture(fixture);
      const { expected } = fixture;

      expect(result.state).toBe(expected.state);

      if (expected.directionBand !== undefined) {
        expect(result.direction?.band ?? null).toBe(expected.directionBand);
      }
      if (expected.subjectStart !== undefined) {
        expect(result.subject.startDate).toBe(expected.subjectStart);
      }
      if (expected.subjectHardSets !== undefined) {
        expect(result.subject.metrics.hardSets).toBe(expected.subjectHardSets);
      }
      if (expected.baselineWeeks !== undefined) {
        expect(result.baseline.weeks).toHaveLength(expected.baselineWeeks);
      }
      if (expected.pulseNull) {
        expect(result.pulse).toBeNull();
      }
      if (expected.pulseCurrentHardSets !== undefined) {
        expect(result.pulse?.currentHardSets).toBe(expected.pulseCurrentHardSets);
      }
      if (expected.pulseBaselineHardSets !== undefined) {
        expect(result.pulse?.baselineHardSetsAverage).toBe(expected.pulseBaselineHardSets);
      }
      if (expected.standoutId !== undefined) {
        expect(result.standout?.id).toBe(expected.standoutId);
      }
      if (expected.watchoutId !== undefined) {
        expect(result.watchout?.id).toBe(expected.watchoutId);
      }
      if (expected.neverPartialVsFull) {
        expect(result.pulse).not.toBeNull();
        // Same-span pulse baseline must be far below a full-week mean of 10 hard sets.
        expect(result.pulse!.baselineHardSetsAverage).toBeLessThan(8);
        expect(result.subject.metrics.hardSets).not.toBe(result.pulse!.currentHardSets);
      }
    },
  );
});
