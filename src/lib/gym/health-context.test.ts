import { beforeEach, describe, expect, it } from "vitest";
import type { HealthSample, LockdBackup } from "@/domain/types";
import { parseBackup } from "@/lib/backup/schema";
import oldBackup from "@/test/fixtures/backup/lockd-backup-v3-before-type-union.json";
import { cloudGymFromState } from "@/lib/cloud/payload";
import type { HealthReading } from "@/lib/native/health";
import { useGym } from "./store";

beforeEach(() => useGym.getState().resetAll());

const sample = (over: Partial<HealthSample> = {}): HealthSample => ({
  id: "hs-1",
  kind: "sleep",
  value: 27_000,
  startAt: "2026-09-29T22:00:00.000Z",
  endAt: "2026-09-30T05:30:00.000Z",
  localDate: "2026-09-30",
  source: "apple_health",
  sourceId: "night:2026-09-30",
  createdAt: "2026-09-30T06:00:00.000Z",
  ...over,
});

describe("health context in backups (Opp 10)", () => {
  it("an old-format backup with no health fields still loads, and health starts empty", () => {
    const parsed = parseBackup(JSON.stringify(oldBackup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.healthSamples).toEqual([]);
    useGym.getState().importBackup(parsed.backup, "replace");
    expect(useGym.getState().healthSamples).toEqual([]);
    expect(useGym.getState().settings.health).toBeUndefined();
  });

  it("samples, imported bodyweight and the health settings survive export, parse and replace", () => {
    const base = oldBackup as unknown as LockdBackup;
    const backup: LockdBackup = {
      ...base,
      measurements: [
        {
          id: "m-1",
          metric: "bodyweight",
          value: 82_400,
          displayUnit: "kg",
          recordedAt: "2026-09-28T07:00:00.000Z",
          localDate: "2026-09-28",
          source: "apple_health",
          sourceId: "bw-1",
          createdAt: "2026-09-28T07:00:00.000Z",
          updatedAt: "2026-09-28T07:00:00.000Z",
        },
      ],
      healthSamples: [sample(), sample({ id: "hs-2", kind: "hrv", method: "sdnn", value: 48, sourceId: "hrv-1" })],
      settings: { ...base.settings, health: { sleep: true, overlays: true } },
    };
    useGym.getState().importBackup(backup, "replace");
    const exported = useGym.getState().exportBackup();
    const parsed = parseBackup(JSON.stringify(exported));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.healthSamples).toEqual(backup.healthSamples);
    expect(parsed.backup.measurements).toEqual(backup.measurements);
    expect(parsed.backup.settings.health).toEqual({ sleep: true, overlays: true });

    useGym.getState().importBackup(parsed.backup, "replace");
    expect(useGym.getState().healthSamples).toHaveLength(2);
    expect(useGym.getState().measurements[0]).toMatchObject({ source: "apple_health", sourceId: "bw-1" });
  });

  it("merging a backup does not duplicate a sample the log already has, by id or by the health store's id", () => {
    const base = oldBackup as unknown as LockdBackup;
    useGym.getState().importBackup({ ...base, healthSamples: [sample()] }, "replace");
    useGym.getState().importBackup(
      { ...base, healthSamples: [sample(), sample({ id: "other-id" }), sample({ id: "hs-3", sourceId: "night:2026-10-01", localDate: "2026-10-01" })] },
      "merge",
    );
    expect(useGym.getState().healthSamples.map((row) => row.id).sort()).toEqual(["hs-1", "hs-3"]);
  });

  it("refuses a sample with no source id or an unknown kind", () => {
    const base = oldBackup as unknown as LockdBackup;
    const bad = { ...base, healthSamples: [{ ...sample(), sourceId: "" }] };
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
    const worse = { ...base, healthSamples: [{ ...sample(), kind: "readiness" }] };
    expect(parseBackup(JSON.stringify(worse)).ok).toBe(false);
  });

  it("never goes to the cloud vault", () => {
    useGym.getState().importBackup({ ...(oldBackup as unknown as LockdBackup), healthSamples: [sample()] }, "replace");
    const payload = cloudGymFromState(useGym.getState()) as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty("healthSamples");
    // And pulling a vault down does not wipe the readings on this device.
    useGym.getState().replaceFromCloud(cloudGymFromState(useGym.getState()));
    expect(useGym.getState().healthSamples).toHaveLength(1);
  });
});

describe("importHealthReading", () => {
  const reading: HealthReading = {
    bodyweight: [{ sourceId: "bw-1", grams: 82_400, at: "2026-09-28T07:00:00.000Z" }],
    sleep: [{ startAt: "2026-09-29T22:00:00.000Z", endAt: "2026-09-30T05:00:00.000Z", asleepSeconds: 25_200 }],
    hrv: [{ sourceId: "hrv-1", method: "sdnn", milliseconds: 48, at: "2026-09-30T05:10:00.000Z" }],
  };

  it("adds ordinary bodyweight rows every reader already understands, plus the samples, in one go", () => {
    const summary = useGym.getState().importHealthReading(reading, "apple_health");
    expect(summary).toEqual({ bodyweight: 1, samples: 2, updated: 0, alreadyOnFile: 0 });
    const state = useGym.getState();
    const row = state.measurements.find((m) => m.sourceId === "bw-1");
    expect(row).toMatchObject({ metric: "bodyweight", value: 82_400, source: "apple_health" });
    expect(state.healthSamples).toHaveLength(2);
  });

  it("reads once: the same reading again adds nothing", () => {
    useGym.getState().importHealthReading(reading, "apple_health");
    const before = useGym.getState().measurements.length;
    const summary = useGym.getState().importHealthReading(reading, "apple_health");
    expect(summary).toEqual({ bodyweight: 0, samples: 0, updated: 0, alreadyOnFile: 3 });
    expect(useGym.getState().measurements).toHaveLength(before);
  });

  it("switching a type on changes only settings.health and reads nothing", () => {
    const before = useGym.getState().measurements.length;
    useGym.getState().setHealthSettings({ sleep: true });
    useGym.getState().setHealthSettings({ overlays: true });
    expect(useGym.getState().settings.health).toEqual({ sleep: true, overlays: true });
    expect(useGym.getState().measurements).toHaveLength(before);
    expect(useGym.getState().healthSamples).toEqual([]);
  });
});
