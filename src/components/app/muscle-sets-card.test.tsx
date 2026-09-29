// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MuscleSetInsight } from "@/domain/analytics/muscleSets";
import type { PersonalMuscleTargets } from "@/domain/types";
import { MuscleSetsCard } from "./muscle-sets-card";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

afterEach(cleanup);

const rows: MuscleSetInsight[] = [
  {
    muscle: "chest",
    sets: 3,
    state: "in_range",
    target: { min: 2, max: 4 },
    targetSource: "research",
    evidence: [
      {
        setId: "set-1",
        workoutId: "workout-1",
        localDate: "2026-09-15",
        exerciseId: "bench",
        exerciseName: "Bench Press",
        role: "primary",
        credit: 1,
        reps: 5,
        weightG: 100_000,
      },
    ],
  },
  {
    muscle: "triceps",
    sets: 1.5,
    state: "below",
    target: { min: 2, max: 4 },
    targetSource: "personal",
    evidence: [
      {
        setId: "set-1",
        workoutId: "workout-1",
        localDate: "2026-09-15",
        exerciseId: "bench",
        exerciseName: "Bench Press",
        role: "secondary",
        credit: 0.5,
        reps: 5,
        weightG: 100_000,
      },
    ],
  },
  {
    muscle: "unmapped",
    sets: 1,
    state: "unmapped",
    evidence: [
      {
        setId: "set-2",
        workoutId: "workout-2",
        localDate: "2026-09-16",
        exerciseId: "custom",
        exerciseName: "Mystery Press",
        role: "primary",
        credit: 1,
      },
    ],
  },
];

function renderCard(
  insights = rows,
  options: {
    personalTargets?: PersonalMuscleTargets;
    onPersonalTargetsChange?: (targets: PersonalMuscleTargets) => void;
  } = {},
) {
  return render(
    <MuscleSetsCard
      insights={insights}
      secondaryCredit={0.5}
      weightUnit="kg"
      personalTargets={options.personalTargets}
      onPersonalTargetsChange={options.onPersonalTargetsChange}
    />,
  );
}

describe("the muscle sets card", () => {
  it("shows target states and never hides unmapped work", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: "Your hard sets this week" })).toBeInTheDocument();
    expect(screen.getByText("In range")).toBeInTheDocument();
    expect(screen.getByText("Below")).toBeInTheDocument();
    expect(screen.getByText("3 of 2–4 credited sets")).toBeInTheDocument();
    expect(screen.getByText("Default range")).toBeInTheDocument();
    expect(screen.getByText("Personal target")).toBeInTheDocument();
    expect(screen.getAllByText("Unmapped").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Fix in Library" })).toHaveAttribute(
      "href",
      "/library",
    );
  });

  it("saves and resets a personal target from the card", async () => {
    const onChange = vi.fn();
    const first = renderCard(rows, { onPersonalTargetsChange: onChange });
    await userEvent.click(screen.getByRole("button", { name: "Edit personal targets" }));
    const minimum = screen.getByRole("spinbutton", { name: "Minimum sets" });
    const maximum = screen.getByRole("spinbutton", { name: "Maximum sets" });
    await userEvent.clear(minimum);
    await userEvent.type(minimum, "12");
    await userEvent.clear(maximum);
    await userEvent.type(maximum, "16");
    await userEvent.click(screen.getByRole("button", { name: "Save personal target" }));
    expect(onChange).toHaveBeenCalledWith({ chest: { min: 12, max: 16 } });

    first.unmount();
    onChange.mockClear();
    renderCard(rows, {
      personalTargets: { chest: { min: 12, max: 16 } },
      onPersonalTargetsChange: onChange,
    });
    await userEvent.click(screen.getByRole("button", { name: "Edit personal targets" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Use the default range" }).at(-1)!);
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("refuses a range that makes no sense, and does not save it", async () => {
    const onChange = vi.fn();
    renderCard(rows, { onPersonalTargetsChange: onChange });
    await userEvent.click(screen.getByRole("button", { name: "Edit personal targets" }));
    const minimum = screen.getByRole("spinbutton", { name: "Minimum sets" });
    await userEvent.clear(minimum);
    await userEvent.type(minimum, "30");
    expect(screen.getByText(/minimum no higher than the maximum/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save personal target" })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("explains the formula and the exact contributing sets on request", async () => {
    renderCard();
    expect(screen.queryByText("Bench Press")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show me why" }));
    expect(screen.getByText(/gives its primary muscle 1 set/i)).toBeInTheDocument();
    expect(screen.getAllByText("Bench Press").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/100 kg × 5/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/secondary · 0.5 set/i)).toBeInTheDocument();
  });

  it("keeps non-muscle totals visible without inventing ranges", () => {
    renderCard([{ muscle: "cardio", sets: 3, state: "not_set", evidence: [] }]);
    expect(screen.getByText("Target not set")).toBeInTheDocument();
    expect(screen.getByText(/does not use a muscle target range/i)).toBeInTheDocument();
  });

  it("says plainly that no sets were logged this week", () => {
    renderCard([]);
    expect(
      screen.getByText(/No completed working sets in this training week yet/),
    ).toBeInTheDocument();
  });

  it("opens the claim for the default range, with its limits and its sources", async () => {
    renderCard();
    expect(screen.queryByText(/doi:/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Why this range" }));
    const sheet = screen.getByRole("dialog");
    expect(
      within(sheet).getByRole("heading", { name: "Why 10–20 credited sets" }),
    ).toBeInTheDocument();
    expect(within(sheet).getByText("Implementation heuristic")).toBeInTheDocument();
    expect(within(sheet).getByText(/does not fix an upper limit of 20/i)).toBeInTheDocument();
    expect(within(sheet).getByText(/doi:10\.1080\/02640414\.2016\.1210197/i)).toBeInTheDocument();
  });
});
