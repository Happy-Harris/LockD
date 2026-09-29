// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { CHANGE_FLAGS_PARTIAL, trainingFlags } from "@/domain/analytics/trainingFlags";
import {
  GOLDEN_OPTIONS,
  fixtureEntry,
  mondayBaseline,
} from "@/domain/analytics/weeklyVerdict.fixtures.helpers";
import { ChangeFlagsCard } from "./change-flags-card";

afterEach(cleanup);

const REF = new Date("2026-09-17T12:00:00.000Z");

describe("the change flags card", () => {
  it("shows Partial instead of a false all-clear without enough history", () => {
    const flags = trainingFlags(
      [fixtureEntry("2026-09-10", "only", { hardSets: 5 })],
      GOLDEN_OPTIONS,
      "monday",
      REF,
    );
    render(<ChangeFlagsCard flags={flags} weightUnit="kg" />);
    expect(screen.getByText(CHANGE_FLAGS_PARTIAL)).toBeInTheDocument();
    expect(screen.queryByText(/^No stall, spike, or deload flags/)).not.toBeInTheDocument();
  });

  it("opens the spike receipt, then the rule, labelled as a product heuristic", async () => {
    const flags = trainingFlags(
      [
        ...mondayBaseline(10),
        fixtureEntry("2026-09-08", "subject-a", { hardSets: 10 }),
        fixtureEntry("2026-09-10", "subject-b", { hardSets: 6 }),
      ],
      GOLDEN_OPTIONS,
      "monday",
      REF,
    );
    render(<ChangeFlagsCard flags={flags} weightUnit="kg" />);
    await userEvent.click(screen.getByRole("button", { name: /Spike\s*Open receipt/i }));

    expect(screen.getByRole("dialog", { name: "Spike" })).toBeInTheDocument();
    expect(screen.getByText(/hard sets \+60% vs baseline/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Open the rule and its limits/i }));
    expect(screen.getByRole("dialog", { name: "Flag rule" })).toBeInTheDocument();
    expect(screen.getByText("Implementation heuristic")).toBeInTheDocument();
    expect(screen.getByText(/No publication attached/i)).toBeInTheDocument();
  });
});
