import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import {
  CHANGE_FLAGS_EMPTY,
  CHANGE_FLAGS_PARTIAL,
  type DeloadFlag,
  type SpikeFlag,
  type StallFlag,
  type TrainingFlags,
} from "@/domain/analytics/trainingFlags";
import { getClaim } from "@/domain/evidence";
import { formatCompactNumber, fromGrams, type WeightUnit } from "@/domain/units";
import { cn } from "@/lib/utils";
import { ClaimEvidenceSheet } from "./claim-evidence-sheet";

type FlagRow = DeloadFlag | SpikeFlag | StallFlag;

function formatE1rm(grams: number | null, unit: WeightUnit): string {
  if (grams === null) return "—";
  return `${formatCompactNumber(fromGrams(grams, unit))} ${unit}`;
}

/**
 * Named flags (deload, spike, stall) recomputed from the log. Each one opens a receipt with the
 * numbers it used and the rule it follows. Not a program: it never says what to do.
 */
export function ChangeFlagsCard({
  flags,
  weightUnit,
}: {
  flags: TrainingFlags;
  weightUnit: WeightUnit;
}) {
  const [selected, setSelected] = useState<FlagRow | null>(null);
  const [showClaim, setShowClaim] = useState(false);
  const claim = selected ? getClaim(selected.claimId) : undefined;

  return (
    <Card data-testid="change-flags">
      <p className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">
        What should I change?
      </p>
      <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-ink">
        Stall, spike and deload flags
      </h2>
      <p className="mt-1 text-sm text-muted">
        Named flags recomputed from logged work. Not a program: open a flag for the receipt.
      </p>

      {flags.active.length === 0 ? (
        <p
          className="mt-4 rounded-lg bg-raised p-3 text-sm text-muted"
          data-testid="change-flags-empty"
        >
          {flags.hasPartial ? CHANGE_FLAGS_PARTIAL : CHANGE_FLAGS_EMPTY}
        </p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-line rounded-lg bg-raised px-3">
            {flags.active.map((flag) => (
              <li key={flag.id === "stall" ? `stall-${flag.liftId}` : flag.id}>
                <button
                  type="button"
                  className={cn(
                    "flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  )}
                  onClick={() => setSelected(flag)}
                >
                  <span className="text-sm font-semibold text-ink">{flag.label}</span>
                  <span className="text-xs font-semibold text-accent">Open receipt</span>
                </button>
              </li>
            ))}
          </ul>
          {flags.hasPartial ? (
            <p className="mt-3 text-xs text-muted">{CHANGE_FLAGS_PARTIAL}</p>
          ) : null}
        </>
      )}

      <Sheet
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setShowClaim(false);
        }}
        title={selected?.label ?? "Flag receipt"}
        description="Numbers from logged sessions. No coaching prescription."
        size="lg"
      >
        {selected ? (
          <div className="space-y-4 text-sm" data-testid="flag-receipt">
            <Card className="p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Receipt</p>
              <p className="mt-1 font-medium text-ink">{selected.receipt}</p>
            </Card>

            {selected.id === "deload" ? (
              <ul className="space-y-1 rounded-lg bg-raised px-3 py-2 font-mono text-xs tabular-nums text-muted">
                <li>
                  Subject week {selected.subjectStartDate} → {selected.subjectEndDate}
                </li>
                <li>
                  Hard sets {selected.subjectHardSets} vs baseline mean{" "}
                  {selected.baselineHardSetsMean.toFixed(1)}
                </li>
                <li>
                  Sessions {selected.subjectSessions} vs floor {selected.sessionFloor}
                </li>
              </ul>
            ) : null}

            {selected.id === "spike" ? (
              <ul className="space-y-1 rounded-lg bg-raised px-3 py-2 font-mono text-xs tabular-nums text-muted">
                <li>
                  Subject week {selected.subjectStartDate} → {selected.subjectEndDate}
                </li>
                <li>
                  Direction {selected.directionBand?.replaceAll("_", " ") ?? "none"}
                  {selected.changePercent != null
                    ? ` (${selected.changePercent >= 0 ? "+" : ""}${Math.round(selected.changePercent)}%)`
                    : ""}
                </li>
              </ul>
            ) : null}

            {selected.id === "stall" ? (
              <ul className="space-y-1 rounded-lg bg-raised px-3 py-2 font-mono text-xs tabular-nums text-muted">
                <li>
                  Window {selected.windowStartDate} → {selected.windowEndDate}
                </li>
                <li>Sessions in window {selected.sessionsInWindow}</li>
                {selected.comparisonStartDate && selected.comparisonEndDate ? (
                  <li data-testid="stall-prior-window">
                    Compared with the prior {selected.sessionsInWindow} sessions, {selected.comparisonStartDate} →{" "}
                    {selected.comparisonEndDate}
                  </li>
                ) : null}
                <li>Best e1RM in window {formatE1rm(selected.bestE1rmInWindowG, weightUnit)}</li>
                <li>
                  Comparison e1RM {formatE1rm(selected.comparisonBestE1rmG, weightUnit)}
                  {selected.comparisonSource
                    ? ` (${selected.comparisonSource.replaceAll("_", " ")})`
                    : ""}
                </li>
              </ul>
            ) : null}

            {claim ? (
              <button
                type="button"
                className="w-full rounded-xl bg-raised px-3 py-2 text-left"
                onClick={() => setShowClaim(true)}
              >
                <span className="block text-sm font-semibold text-ink">{claim.statement}</span>
                <span className="mt-1 block text-micro text-accent">
                  Open the rule and its limits
                </span>
              </button>
            ) : null}
          </div>
        ) : null}
      </Sheet>

      {claim ? (
        <ClaimEvidenceSheet
          open={showClaim}
          onClose={() => setShowClaim(false)}
          claim={claim}
          title="Flag rule"
        />
      ) : null}
    </Card>
  );
}
