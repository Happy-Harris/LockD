// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setLabel } from "@/lib/cloud/history-link";
import { HistorySessionCard } from "./history-log";

afterEach(cleanup);

describe("the read-only log", () => {
  it("words each set as it was logged, in the lifter's unit", () => {
    expect(setLabel({ type: "working", weightG: 100_000, reps: 5 }, "kg")).toBe("100 kg × 5");
    expect(setLabel({ type: "warmup", weightG: 60_000, reps: 8 }, "kg")).toBe("W 60 kg × 8");
    expect(setLabel({ type: "working", weightG: 102_058, reps: 3, rpe: 8 }, "lb")).toBe("225 lb × 3, RPE 8");
    expect(setLabel({ type: "working", reps: 12, side: "left" }, "kg")).toBe("12 reps (L)");
    expect(setLabel({ type: "working", distanceM: 2000, durationSeconds: 480 }, "kg")).toBe("2 km, 8:00");
    expect(setLabel({ type: "failure" }, "kg")).toBe("F —");
  });

  it("shows a session's name, date and sets", () => {
    render(
      <HistorySessionCard
        unit="kg"
        session={{ date: "2026-01-08", name: "Upper", durationSec: 3300, exercises: [{ name: "Bench Press", sets: [{ type: "working", weightG: 100_000, reps: 6 }] }] }}
      />,
    );
    expect(screen.getByText("Upper")).toBeVisible();
    expect(screen.getByText("Bench Press")).toBeVisible();
    expect(screen.getByText("100 kg × 6")).toBeVisible();
    expect(screen.getByText("55 min")).toBeVisible();
  });
});
