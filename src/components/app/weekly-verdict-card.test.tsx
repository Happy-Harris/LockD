// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WeeklyVerdict } from "@/domain/analytics/weeklyVerdict";
import type { MuscleBandBalance } from "@/domain/analytics/muscleSets";
import { stampWord } from "@/lib/gym/verdict-stamp";
import { WeeklyVerdictCard } from "./weekly-verdict-card";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/settings">{children}</a>,
}));

afterEach(cleanup);

const verdict: WeeklyVerdict = {
  state: "full",
  subject: {
    startDate: "2026-09-07",
    endDate: "2026-09-13",
    metrics: { hardSets: 12, sessions: 3, tonnageG: 48_000_000 },
  },
  baseline: {
    metrics: { hardSets: 10, sessions: 3, tonnageG: 45_000_000 },
    weeks: [
      {
        startDate: "2026-08-10",
        endDate: "2026-08-16",
        entries: [],
        sessionCount: 3,
      },
      {
        startDate: "2026-08-17",
        endDate: "2026-08-23",
        entries: [],
        sessionCount: 3,
      },
      {
        startDate: "2026-08-24",
        endDate: "2026-08-30",
        entries: [],
        sessionCount: 3,
      },
      {
        startDate: "2026-08-31",
        endDate: "2026-09-06",
        entries: [],
        sessionCount: 3,
      },
    ],
  },
  direction: { id: "direction_up", band: "up", changePercent: 20 },
  standout: { id: "standout_metric_mover", text: "Hard sets|20" },
  watchout: { id: "watchout_none" },
  pulse: {
    currentHardSets: 5,
    baselineHardSetsAverage: 4,
    baselineWeeks: 4,
    changePercent: 25,
  },
  goalLifts: [],
  goalLiftSource: "inferred",
};

const card = (
  over: Partial<WeeklyVerdict> = {},
  props: {
    lens?: "build" | "strength" | "maintain";
    stamp?: boolean;
    muscleBalance?: MuscleBandBalance | null;
  } = {},
) =>
  render(
    <WeeklyVerdictCard
      verdict={{ ...verdict, ...over }}
      weightUnit="kg"
      lens={props.lens ?? "build"}
      lensLabel="Powerbuilding"
      stamp={props.stamp}
      muscleBalance={props.muscleBalance}
    />,
  );

describe("the weekly verdict card", () => {
  it("presents the completed week separately from the same-span current pulse", () => {
    card();
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Sep 7–13")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /5 hard sets\. Show evidence/ })).toBeInTheDocument();
  });

  it("opens the arithmetic behind a number: the formula, and the baseline mean", async () => {
    card();
    await userEvent.click(screen.getByRole("button", { name: /12 hard sets\. Show evidence/ }));
    expect(screen.getByRole("dialog", { name: "Hard sets evidence" })).toBeInTheDocument();
    expect(screen.getByTestId("verdict-evidence")).toHaveTextContent("Mean 10 hard sets");
  });

  it("keeps 44px minimum targets on the number buttons", () => {
    card();
    const button = screen.getByRole("button", { name: /12 hard sets\. Show evidence/ });
    expect(button.className).toMatch(/min-h-11/);
    expect(button.className).toMatch(/min-w-11/);
  });

  it("says nothing was chosen when the goal lifts are inferred, and names the lifter's own picks plainly", () => {
    card({
      goalLiftSource: "inferred",
      goalLifts: [{ id: "seed-bench-press", name: "Bench Press", sessions: 4 }],
    });
    expect(screen.getByText(/Based on your top lifts: Bench Press\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose" })).toBeInTheDocument();
    cleanup();
    card({
      goalLiftSource: "chosen",
      goalLifts: [{ id: "seed-back-squat", name: "Back Squat", sessions: 2 }],
    });
    expect(screen.getByText(/Goal lifts: Back Squat\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toBeInTheDocument();
  });

  it("shows which lens the wording follows", () => {
    card();
    expect(screen.getByText("Wording follows your lens: Powerbuilding.")).toBeInTheDocument();
  });

  it("puts the strength framing into the words, not the numbers", () => {
    const deload: Partial<WeeklyVerdict> = {
      state: "deload",
      direction: null,
      standout: null,
      watchout: null,
      intensityHeld: true,
    };
    card(deload, { lens: "strength" });
    const strength = screen.getByTestId("weekly-verdict").textContent;
    cleanup();
    card(deload, { lens: "build" });
    expect(screen.getByTestId("weekly-verdict").textContent).not.toBe(strength);
  });
});

describe("the stamp", () => {
  it("names a direction only when the log can back one", () => {
    const words = (over: Partial<WeeklyVerdict>) => stampWord({ ...verdict, ...over });
    expect(words({})).toBe("UP");
    expect(words({ direction: { id: "d", band: "big_jump", changePercent: 80 } })).toBe("UP");
    expect(words({ direction: { id: "d", band: "steady", changePercent: 0 } })).toBe("HOLD");
    expect(words({ direction: { id: "d", band: "down", changePercent: -15 } })).toBe("DOWN");
    expect(words({ direction: { id: "d", band: "well_down", changePercent: -40 } })).toBe("DOWN");
    expect(words({ state: "deload", direction: null })).toBe("LIGHT");
    expect(words({ state: "not_enough_history", direction: null })).toBeNull();
    expect(words({ state: "welcome_back", direction: null })).toBeNull();
  });

  it("is drawn only where asked for", () => {
    card({}, { stamp: true });
    expect(screen.getByTestId("verdict-stamp")).toHaveTextContent("UP");
    cleanup();
    card();
    expect(screen.queryByTestId("verdict-stamp")).not.toBeInTheDocument();
  });

  it("is not drawn while there is not enough history", () => {
    card({ state: "not_enough_history", direction: null }, { stamp: true });
    expect(screen.queryByTestId("verdict-stamp")).not.toBeInTheDocument();
  });
});

describe("the muscle balance line", () => {
  const chest = {
    muscle: "chest" as const,
    sets: 5,
    state: "below" as const,
    target: { min: 10, max: 20 },
    targetSource: "research" as const,
    evidence: [],
  };
  const balance: MuscleBandBalance = {
    weekStartDate: "2026-09-07",
    weekEndDate: "2026-09-13",
    insights: [chest],
    judged: [chest],
    below: [chest],
    inRange: [],
    above: [],
    insufficientMapping: false,
  };

  it("is a labelled region with a stable id, only when there is a balance to show", () => {
    card({}, { muscleBalance: balance });
    const region = screen.getByRole("region", { name: "Muscle balance" });
    expect(region).toHaveAttribute("data-balance-id", "balance_judged");
    expect(region).toHaveTextContent("Balance: Chest below.");
    cleanup();
    card();
    expect(screen.queryByRole("region", { name: "Muscle balance" })).not.toBeInTheDocument();
  });

  it("opens its evidence, with a way into the default range's claim", async () => {
    card({}, { muscleBalance: balance });
    await userEvent.click(screen.getByRole("button", { name: /Balance: Chest below/ }));
    expect(screen.getByRole("dialog", { name: /Muscle balance evidence/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /About the default range/i }));
    expect(screen.getByRole("dialog", { name: "Why 10–20 credited sets" })).toBeInTheDocument();
  });
});
