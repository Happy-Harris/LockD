import { describe, expect, it } from "vitest";
import type { BodyMeasurement } from "@/domain/types";
import { useGym } from "@/lib/gym/store";
import { cloudGymFromState, isDeviceOnlyMeasurement } from "./payload";

const row = (id: string, source?: BodyMeasurement["source"]): BodyMeasurement =>
  ({
    id,
    metric: "bodyweight",
    value: 83000,
    displayUnit: "kg",
    recordedAt: "2026-09-01T07:00:00.000Z",
    localDate: "2026-09-01",
    createdAt: "2026-09-01T07:00:00.000Z",
    updatedAt: "2026-09-01T07:00:00.000Z",
    ...(source ? { source } : {}),
  }) as BodyMeasurement;

describe("health bodyweight and the vault", () => {
  it("leaves health-sourced rows out and keeps typed ones", () => {
    expect(isDeviceOnlyMeasurement(row("a"))).toBe(false);
    expect(isDeviceOnlyMeasurement(row("c", "apple_health"))).toBe(true);
    expect(isDeviceOnlyMeasurement(row("d", "health_connect"))).toBe(true);
    const state = { ...useGym.getState(), measurements: [row("a"), row("b"), row("c", "apple_health"), row("d", "health_connect")] };
    expect(cloudGymFromState(state).measurements.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("a pull from the vault keeps this device's health rows", () => {
    const store = useGym.getState();
    useGym.setState({ measurements: [row("typed"), row("health", "apple_health")] });
    const payload = { ...cloudGymFromState(useGym.getState()), measurements: [row("typed"), row("from-cloud")] };
    useGym.getState().replaceFromCloud(payload);
    expect(useGym.getState().measurements.map((m) => m.id).sort()).toEqual(["from-cloud", "health", "typed"]);
    useGym.setState({ measurements: store.measurements });
  });
});
