import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { VerdictLens } from "@/domain/analytics/lens";
import {
  weeklyVerdictCopy,
  type SentencePart,
  type VerdictEvidenceKey,
  type WeeklyVerdict,
} from "@/domain/analytics/weeklyVerdict";
import type { WeightUnit } from "@/domain/units";
import { formatDateRange } from "@/domain/analytics/weeklyVerdict.util";
import { stampWord } from "@/lib/gym/verdict-stamp";
import { VerdictEvidenceSheet } from "./verdict-evidence-sheet";

/**
 * Last week against the weeks before it, in plain sentences. Every number in a sentence opens the
 * logged weeks and arithmetic behind it. The wording follows the lifter's lens; no figure does.
 */
export function WeeklyVerdictCard({
  verdict,
  weightUnit,
  lens,
  lensLabel,
  stamp = false,
}: {
  verdict: WeeklyVerdict;
  weightUnit: WeightUnit;
  lens: VerdictLens;
  lensLabel: string;
  /** Show the direction stamp beside the title (the home screen does). */
  stamp?: boolean;
}) {
  const word = stamp ? stampWord(verdict) : null;
  const [evidenceKey, setEvidenceKey] = useState<VerdictEvidenceKey | null>(null);
  const copy = weeklyVerdictCopy(verdict, weightUnit, null, lens);
  const liftNames = verdict.goalLifts.map((lift) => lift.name).join(", ");

  return (
    <section aria-labelledby="weekly-verdict-heading" data-testid="weekly-verdict">
      <Card className="border border-accent/30">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
              Weekly verdict
            </p>
            <h2
              id="weekly-verdict-heading"
              className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink"
            >
              {copy.title}
            </h2>
            <p className="mt-0.5 text-xs text-subtle">
              {formatDateRange(verdict.subject.startDate, verdict.subject.endDate)}
            </p>
          </div>
          {word ? (
            <div
              className="verdict-stamp grid size-20 shrink-0 place-items-center rounded-md text-sm font-extrabold"
              data-testid="verdict-stamp"
            >
              {word}
            </div>
          ) : (
            <Badge tone={copy.available ? "accent" : "muted"}>{copy.baselineLabel}</Badge>
          )}
        </div>

        <div className="mt-2 space-y-1 text-sm text-muted">
          {copy.lines.map((line) => (
            <p key={line.plain} className="flex min-h-11 flex-wrap items-center px-1 py-1">
              <SentenceParts parts={line.parts} onOpen={setEvidenceKey} />
            </p>
          ))}
        </div>

        {copy.pulse ? (
          <div className="mt-3 flex min-h-11 flex-wrap items-center border-t border-line px-1 pt-3 text-xs text-subtle">
            <SentenceParts parts={copy.pulse.parts} onOpen={setEvidenceKey} />
          </div>
        ) : null}

        {verdict.state === "full" ? (
          <p className="mt-2 px-1 text-xs text-subtle">
            {verdict.goalLiftSource === "chosen"
              ? liftNames
                ? `Goal lifts: ${liftNames}.`
                : "Goal lifts set, but none logged in this baseline."
              : liftNames
                ? `Based on your top lifts: ${liftNames}.`
                : "You haven’t set goal lifts yet."}{" "}
            <Link
              to="/settings"
              className="font-semibold text-accent underline decoration-accent/50 underline-offset-2"
            >
              {verdict.goalLiftSource === "chosen" ? "Edit" : "Choose"}
            </Link>
          </p>
        ) : null}
        <p className="mt-1 px-1 text-xs text-subtle">Wording follows your lens: {lensLabel}.</p>
      </Card>

      <VerdictEvidenceSheet
        open={evidenceKey !== null}
        onClose={() => setEvidenceKey(null)}
        verdict={verdict}
        weightUnit={weightUnit}
        focusKey={evidenceKey ?? undefined}
      />
    </section>
  );
}

function SentenceParts({
  parts,
  onOpen,
}: {
  parts: SentencePart[];
  onOpen: (key: VerdictEvidenceKey) => void;
}) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.type === "metric" && part.evidenceKey) {
          return (
            <button
              key={`${part.text}-${index}`}
              type="button"
              className="mx-0.5 inline-flex min-h-11 min-w-11 items-center justify-center rounded px-1.5 font-semibold tabular-nums text-ink underline decoration-accent/50 underline-offset-2 transition hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onClick={() => onOpen(part.evidenceKey!)}
              aria-label={`${part.text}. Show evidence`}
            >
              {part.text}
            </button>
          );
        }
        return <span key={`${part.text}-${index}`}>{part.text}</span>;
      })}
    </>
  );
}
