// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Exercise } from "@/domain/types";
import { GoalLensSheet } from "./goal-lens-sheet";
import { GoalLiftPicker } from "./goal-lift-picker";

afterEach(cleanup);

const ex = (id: string, name: string, over: Partial<Exercise> = {}): Exercise => ({
  id,
  name,
  primaryMuscleGroup: "chest",
  secondaryMuscleGroups: [],
  equipment: "barbell",
  movementPattern: "horizontal push",
  trackingType: "weight_reps",
  isCustom: false,
  isArchived: false,
  createdAt: "",
  updatedAt: "",
  ...over,
});
const library = [
  ex("a", "Bench Press"),
  ex("b", "Back Squat"),
  ex("c", "Deadlift"),
  ex("d", "Overhead Press"),
  ex("e", "Old Lift", { isArchived: true }),
  ex("f", "My Custom Lift", { isCustom: true }),
];

const picker = (ids: string[] | undefined, onChange = vi.fn(), onClose = vi.fn()) =>
  render(
    <GoalLiftPicker
      open
      onClose={onClose}
      exercises={library}
      goalLiftIds={ids}
      onChange={onChange}
    />,
  );

describe("the goal lift picker", () => {
  it("starts from what is saved, and hides archived exercises", () => {
    picker(["b"]);
    expect(screen.getByText("1 of 3 chosen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back Squat/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText("Old Lift")).not.toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("allows three, and stops there", async () => {
    picker([]);
    for (const name of ["Bench Press", "Back Squat", "Deadlift"]) {
      await userEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
    }
    expect(screen.getByText("3 of 3 chosen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Overhead Press/ })).toBeDisabled();
    // taking one off frees a place
    await userEvent.click(screen.getByRole("button", { name: /Deadlift/ }));
    expect(screen.getByRole("button", { name: /Overhead Press/ })).toBeEnabled();
  });

  it("saves what was chosen, in the order it was chosen, and nothing before Save", async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    picker([], onChange, onClose);
    await userEvent.click(screen.getByRole("button", { name: /Deadlift/ }));
    await userEvent.click(screen.getByRole("button", { name: /Bench Press/ }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onChange).toHaveBeenCalledWith(["c", "a"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("goes back to the most-trained lifts when asked", async () => {
    const onChange = vi.fn();
    picker(["a", "b"], onChange);
    await userEvent.click(screen.getByRole("button", { name: "Use my top lifts instead" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("searches the library", async () => {
    picker([]);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search exercises" }), "squat");
    expect(screen.getByRole("button", { name: /Back Squat/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bench Press/ })).not.toBeInTheDocument();
  });
});

describe("the goal lens sheet", () => {
  it("marks the current lens, and changes it on a tap without changing anything else", async () => {
    const onChange = vi.fn();
    render(<GoalLensSheet open onClose={vi.fn()} lens="strength" onChange={onChange} />);
    expect(screen.getByRole("button", { name: /Strength/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: /Hybrid/ }));
    expect(onChange).toHaveBeenCalledWith("hybrid");
  });
});
