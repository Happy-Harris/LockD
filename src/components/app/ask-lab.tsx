import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ASK_LAB_STARTERS,
  EXPLORE_BADGE,
  answerAskLab,
  type AskLabAnswer,
  type AskLabTier,
} from "@/domain/analytics/askLab";
import type { StrengthTrendRow } from "@/domain/analytics/askLabShared";
import { getClaim, type EvidenceClaim, type EvidenceKind } from "@/domain/evidence";
import { titleCase } from "@/domain/taxonomy";
import { formatCompactNumber, fromGrams, weightUnitFor, type WeightUnit } from "@/domain/units";
import { loggedEntriesOf } from "@/lib/gym/entries";
import { useSlices } from "@/lib/gym/hooks";
import { useGym } from "@/lib/gym/store";
import { ClaimEvidenceSheet } from "./claim-evidence-sheet";
import { CitedSessions } from "./cited-sessions";
import { verdictFraming } from "@/lib/gym/lenses";

const KIND_LABEL: Record<EvidenceKind, string> = {
  evidence_backed_default: "Research default",
  implementation_heuristic: "Implementation heuristic",
  user_editable_personal: "Personal target",
  pure_calculation: "Pure calculation",
};

const TIER_BADGE: Record<AskLabTier, string> = {
  computed: "Computed from your log",
  partial: "Partial",
  catalog: "From the evidence catalog",
  explore: EXPLORE_BADGE,
};

function formatSets(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function Rows({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-line rounded-xl bg-raised px-3 hairline">{children}</ul>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="font-medium">{label}</span>
      <span className="font-mono text-xs tabular text-muted">{value}</span>
    </li>
  );
}

/** The sessions behind a set of evidence rows, once each, oldest first. */
function sessionsOf(rows: ReadonlyArray<{ workoutId: string; localDate: string }>) {
  const seen = new Map<string, { workoutId: string; date: string }>();
  for (const row of rows) seen.set(row.workoutId, { workoutId: row.workoutId, date: row.localDate });
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Ask the Lab, answered on this device from the log. It picks one of five questions about the
 * lifter's own training or a claim from the evidence catalog, and cites what it used. It never
 * invents a number: a question it cannot compute is labelled as not computed. Works signed out.
 */
export function AskLab() {
  const settings = useGym((s) => s.settings);
  const slices = useSlices();
  const entries = useMemo(() => loggedEntriesOf(slices), [slices]);
  const unit = weightUnitFor(settings.unitSystem);
  const [draft, setDraft] = useState("");
  const [answer, setAnswer] = useState<AskLabAnswer | null>(null);
  const [claim, setClaim] = useState<EvidenceClaim | null>(null);

  const submit = (query: string) => {
    setDraft(query);
    setAnswer(
      answerAskLab(query, {
        entries,
        weekStart: settings.weekStartDay,
        secondaryCredit: settings.secondaryMuscleCredit,
        personalTargetBands: settings.personalMuscleTargets,
        formula: settings.oneRepMaxFormula,
        includeWarmups: !settings.excludeWarmupsFromAnalytics,
        weightUnit: unit,
        goalLiftIds: settings.goalLiftIds,
        goalLens: verdictFraming(settings.goalLens),
      }),
    );
  };

  const payload = answer?.payload;

  return (
    <section className="mt-6" data-testid="ask-lab">
      <h2 className="font-display text-2xl font-semibold tracking-tight">Ask the Lab</h2>
      <p className="mt-1 text-sm text-muted">
        Answered on this device from your log. No account needed.
      </p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim()) submit(draft);
        }}
      >
        <Input
          aria-label="Ask the Lab"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Am I training enough?"
        />
        <Button type="submit" disabled={!draft.trim()}>
          Ask
        </Button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        {ASK_LAB_STARTERS.map((starter) => (
          <Button
            key={starter.query}
            size="sm"
            variant="ghost"
            onClick={() => submit(starter.query)}
          >
            {starter.label}
          </Button>
        ))}
      </div>

      {answer ? (
        <Card className="mt-3 space-y-3" data-testid="ask-lab-answer">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={answer.tier === "computed" ? "accent" : "muted"}>
              {TIER_BADGE[answer.tier]}
            </Badge>
            {answer.intent ? (
              <span className="text-micro font-medium uppercase tracking-wide text-subtle">
                {answer.intent.replaceAll("_", " ")}
              </span>
            ) : null}
          </div>
          <p className="text-sm font-medium leading-relaxed">{answer.call}</p>
          {answer.known ? (
            <p className="text-xs text-muted">
              <span className="font-semibold text-ink">Known: </span>
              {answer.known}
            </p>
          ) : null}
          {answer.missing ? (
            <p className="text-xs text-muted">
              <span className="font-semibold text-ink">Missing: </span>
              {answer.missing}
            </p>
          ) : null}
          {answer.nextStep ? (
            <p className="text-xs text-muted">
              <span className="font-semibold text-ink">Next: </span>
              {answer.nextStep}
            </p>
          ) : null}

          {payload?.kind === "training_enough" && payload.muscles.length > 0 ? (
            <Rows>
              {payload.muscles.slice(0, 8).map((row) => (
                <Row
                  key={row.muscle}
                  label={titleCase(row.muscle)}
                  value={
                    row.targetMin != null && row.targetMax != null
                      ? `${formatSets(row.sets)} of ${formatSets(row.targetMin)}–${formatSets(row.targetMax)}`
                      : `${formatSets(row.sets)} credited`
                  }
                />
              ))}
            </Rows>
          ) : null}
          {payload?.kind === "training_enough" && payload.evidence.length > 0 ? (
            <CitedSessions cites={sessionsOf(payload.evidence)} lift="training" />
          ) : null}
          {payload?.kind === "muscle_contribution" && payload.attributions.length > 0 ? (
            <Rows>
              {payload.attributions.map((row) => (
                <Row
                  key={row.exerciseId}
                  label={row.exerciseName}
                  value={`${formatSets(row.creditedSets)} credited · ${row.roles.join("/")}`}
                />
              ))}
            </Rows>
          ) : null}
          {payload?.kind === "muscle_contribution" && payload.evidence.length > 0 ? (
            <CitedSessions cites={sessionsOf(payload.evidence)} lift={payload.muscle} />
          ) : null}
          {payload?.kind === "getting_stronger" && payload.trends.length > 0 ? (
            <Rows>
              {payload.trends.map((row) => (
                <StrengthRow key={row.exerciseId} row={row} unit={unit} />
              ))}
            </Rows>
          ) : null}
          {payload?.kind === "verdict_why" ? (
            <p className="text-xs text-subtle">
              Week {payload.subjectStartDate} → {payload.subjectEndDate} · state{" "}
              {payload.verdict.state.replaceAll("_", " ")}
            </p>
          ) : null}
          {payload?.kind === "change_flags" && payload.activeLabels.length > 0 ? (
            <Rows>
              {payload.activeLabels.map((label, index) => (
                <li key={label} className="py-2 text-sm">
                  <p className="font-medium">{label}</p>
                  <p className="mt-0.5 text-xs text-muted">{payload.receipts[index]}</p>
                </li>
              ))}
            </Rows>
          ) : null}

          {answer.matches.length > 0 ? (
            <ul className="space-y-2" aria-label="Cited claims">
              {answer.matches.map(({ claim: cited }) => (
                <li key={cited.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-raised px-3 py-2 text-left hairline"
                    onClick={() => setClaim(getClaim(cited.id) ?? cited)}
                  >
                    <span className="block text-sm font-medium">{cited.statement}</span>
                    <span className="mt-1 inline-flex rounded-full px-2 py-0.5 text-micro font-semibold text-muted hairline">
                      {KIND_LABEL[cited.kind]}
                    </span>
                    <span className="mt-1 block text-micro text-accent">Open receipt</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {answer.tier === "explore" ? (
            <p className="text-xs text-muted">
              The Lab will not invent papers or training numbers. The chips above cover your logged
              work.
            </p>
          ) : null}
        </Card>
      ) : null}

      {claim ? (
        <ClaimEvidenceSheet
          open
          onClose={() => setClaim(null)}
          claim={claim}
          title="Claim receipt"
        />
      ) : null}
    </section>
  );
}

/** A lift's first and last estimate in the window, each with the set and session it came from. */
function StrengthRow({ row, unit }: { row: StrengthTrendRow; unit: WeightUnit }) {
  const sample = (value: number, from?: StrengthTrendRow["first"]) =>
    `${formatCompactNumber(fromGrams(value, unit))} ${unit}${
      from ? ` (${formatCompactNumber(fromGrams(from.weightG, unit))} × ${from.reps})` : ""
    }`;
  const cites = [row.first, row.last]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({ workoutId: item.workoutId, date: item.localDate }));
  return (
    <li className="py-2 text-sm" data-testid="lab-strength-row">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{row.exerciseName}</span>
        <span className="font-mono text-xs tabular text-muted">
          {row.changePercent != null
            ? `${row.changePercent >= 0 ? "+" : ""}${row.changePercent.toFixed(0)}%`
            : "change unknown"}
        </span>
      </div>
      <p className="mt-0.5 font-mono text-xs tabular text-muted">
        {sample(row.firstE1rmG, row.first)} → {sample(row.lastE1rmG, row.last)}, {row.sessionsWithE1rm} sessions
      </p>
      <CitedSessions cites={cites} lift={row.exerciseName} />
    </li>
  );
}
