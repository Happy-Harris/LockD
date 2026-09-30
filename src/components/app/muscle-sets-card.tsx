import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  RESEARCH_MUSCLE_TARGET,
  researchTargetFor,
  type MuscleSetInsight,
  type MuscleTargetState,
} from "@/domain/analytics/muscleSets";
import { researchMuscleTargetClaim } from "@/domain/evidence";
import { MUSCLE_GROUPS, titleCase } from "@/domain/taxonomy";
import type { MuscleGroup, PersonalMuscleTargets } from "@/domain/types";
import { formatWeight, type WeightUnit } from "@/domain/units";
import { cn } from "@/lib/utils";
import { formatSets, stateLabel } from "@/lib/gym/muscle-labels";
import { ClaimEvidenceSheet } from "./claim-evidence-sheet";

const TARGETABLE_MUSCLES = MUSCLE_GROUPS.filter((muscle) => researchTargetFor(muscle));

const selectClass =
  "mt-1 h-11 w-full rounded-xl bg-raised px-3 text-sm text-ink hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70";
const numberClass =
  "mt-1 h-11 w-full rounded-xl bg-raised px-3 text-ink tabular-nums hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70";

function stateTone(state: MuscleTargetState): string {
  if (state === "in_range") return "text-success";
  if (state === "not_set") return "text-subtle";
  return "text-warning";
}

/**
 * This week's credited sets per muscle against a target: the default band of 10 to 20, or a band
 * the lifter saved. Completed working sets only. A muscle with no mapped exercise is "Unmapped",
 * never "low". Every row can show the sets it was built from.
 */
export function MuscleSetsCard({
  insights,
  secondaryCredit,
  weightUnit,
  personalTargets = {},
  onPersonalTargetsChange,
}: {
  insights: readonly MuscleSetInsight[];
  secondaryCredit: number;
  weightUnit: WeightUnit;
  personalTargets?: PersonalMuscleTargets;
  onPersonalTargetsChange?: (targets: PersonalMuscleTargets) => void;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [showResearchEvidence, setShowResearchEvidence] = useState(false);
  const [showTargetEditor, setShowTargetEditor] = useState(false);
  const initialMuscle =
    insights.find((row) => researchTargetFor(row.muscle))?.muscle ?? TARGETABLE_MUSCLES[0];
  const [editingMuscle, setEditingMuscle] = useState<MuscleGroup>(initialMuscle ?? "chest");
  const initialTarget = personalTargets[editingMuscle] ?? RESEARCH_MUSCLE_TARGET;
  const [draftMin, setDraftMin] = useState(String(initialTarget.min));
  const [draftMax, setDraftMax] = useState(String(initialTarget.max));
  const hasNonMuscleTotals = insights.some((row) => row.state === "not_set");
  const parsedMin = Number.parseFloat(draftMin);
  const parsedMax = Number.parseFloat(draftMax);
  const draftValid =
    Number.isFinite(parsedMin) &&
    Number.isFinite(parsedMax) &&
    parsedMin >= 0 &&
    parsedMax <= 100 &&
    parsedMin <= parsedMax;

  return (
    <Card data-testid="muscle-sets">
      <p className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">
        Am I training enough?
      </p>
      <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-ink">
        Your hard sets this week
      </h2>
      <p className="mt-1 text-sm text-muted">
        Completed working sets only. Warm-ups, drop sets, failure sets and unfinished sets do not
        count.
      </p>

      {insights.length === 0 ? (
        <p className="mt-4 rounded-lg bg-raised p-3 text-sm text-muted">
          No completed working sets in this training week yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-lg bg-raised px-3">
          {insights.map((row) => (
            <li
              key={row.muscle}
              className="flex min-h-14 items-center justify-between gap-3 py-2"
              data-testid={`muscle-row-${row.muscle}`}
            >
              <div>
                <p className="text-sm font-semibold text-ink">{titleCase(row.muscle)}</p>
                {row.muscle === "unmapped" ? (
                  <Link to="/library" className="text-xs font-medium text-accent">
                    Fix in Library
                  </Link>
                ) : null}
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-bold tabular-nums text-ink">
                  {row.target
                    ? `${formatSets(row.sets)} of ${formatSets(row.target.min)}–${formatSets(row.target.max)} credited sets`
                    : `${formatSets(row.sets)} credited sets`}
                </p>
                <p className={cn("text-xs font-semibold", stateTone(row.state))}>
                  {stateLabel(row)}
                </p>
                {row.targetSource ? (
                  <p className="text-micro text-subtle">
                    {row.targetSource === "personal" ? "Personal target" : "Default range"}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasNonMuscleTotals ? (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Full-body and cardio work stays visible as a total, but does not use a muscle target
          range.
        </p>
      ) : null}

      {insights.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={showEvidence}
            onClick={() => setShowEvidence((v) => !v)}
          >
            {showEvidence ? "Hide evidence" : "Show me why"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowResearchEvidence(true)}>
            Why this range
          </Button>
          {onPersonalTargetsChange ? (
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={showTargetEditor}
              onClick={() => setShowTargetEditor((v) => !v)}
            >
              {showTargetEditor ? "Close target editor" : "Edit personal targets"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {showTargetEditor && onPersonalTargetsChange ? (
        <div className="mt-3 border-t border-line pt-3" data-testid="target-editor">
          <h3 className="text-sm font-semibold text-ink">Personal target</h3>
          <p className="mt-1 text-xs text-muted">
            Each muscle starts at the 10–20 default. Save a range of your own when your program
            calls for one.
          </p>
          <label className="mt-3 block text-xs font-semibold text-muted">
            Muscle
            <select
              className={selectClass}
              value={editingMuscle}
              onChange={(event) => {
                const muscle = event.target.value as MuscleGroup;
                const target = personalTargets[muscle] ?? RESEARCH_MUSCLE_TARGET;
                setEditingMuscle(muscle);
                setDraftMin(String(target.min));
                setDraftMax(String(target.max));
              }}
            >
              {TARGETABLE_MUSCLES.map((muscle) => (
                <option key={muscle} value={muscle}>
                  {titleCase(muscle)}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-muted">
              Minimum sets
              <input
                aria-label="Minimum sets"
                className={numberClass}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.5}
                value={draftMin}
                onChange={(event) => setDraftMin(event.target.value)}
              />
            </label>
            <label className="text-xs font-semibold text-muted">
              Maximum sets
              <input
                aria-label="Maximum sets"
                className={numberClass}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.5}
                value={draftMax}
                onChange={(event) => setDraftMax(event.target.value)}
              />
            </label>
          </div>
          {!draftValid ? (
            <p className="mt-2 text-xs font-semibold text-warning">
              Enter a range from 0 to 100 with the minimum no higher than the maximum.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!draftValid}
              onClick={() =>
                onPersonalTargetsChange({
                  ...personalTargets,
                  [editingMuscle]: { min: parsedMin, max: parsedMax },
                })
              }
            >
              Save personal target
            </Button>
            {personalTargets[editingMuscle] ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const next = { ...personalTargets };
                  delete next[editingMuscle];
                  setDraftMin(String(RESEARCH_MUSCLE_TARGET.min));
                  setDraftMax(String(RESEARCH_MUSCLE_TARGET.max));
                  onPersonalTargetsChange(next);
                }}
              >
                Use the default range
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {showEvidence ? (
        <div className="mt-3 border-t border-line pt-3" data-testid="muscle-evidence">
          <p className="text-xs leading-relaxed text-muted">
            A completed working set gives its primary muscle 1 set. Each secondary muscle gets{" "}
            {formatSets(secondaryCredit)} set. The same physical set is listed under every muscle it
            credits.
          </p>
          <div className="mt-3 space-y-3">
            {insights.map((row) => (
              <section key={row.muscle} aria-labelledby={`evidence-${row.muscle}`}>
                <h3 id={`evidence-${row.muscle}`} className="text-sm font-semibold text-ink">
                  {titleCase(row.muscle)} · {formatSets(row.sets)} sets
                </h3>
                <ul className="mt-1 space-y-1">
                  {row.evidence.map((item) => (
                    <li
                      key={`${row.muscle}-${item.setId}-${item.role}`}
                      className="rounded-lg bg-surface px-3 py-2 text-xs hairline"
                    >
                      <div className="flex justify-between gap-3">
                        <span className="font-semibold text-ink">{item.exerciseName}</span>
                        <span className="shrink-0 text-subtle">{item.localDate}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap justify-between gap-x-3 text-muted">
                        <span>
                          {titleCase(item.role)} · {formatSets(item.credit)} set
                        </span>
                        {item.weightG !== undefined || item.reps !== undefined ? (
                          <span>
                            {item.weightG !== undefined
                              ? `${formatWeight(item.weightG, weightUnit)} ${weightUnit}`
                              : "Bodyweight"}
                            {item.reps !== undefined ? ` × ${item.reps}` : ""}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      ) : null}

      <ClaimEvidenceSheet
        open={showResearchEvidence}
        onClose={() => setShowResearchEvidence(false)}
        claim={researchMuscleTargetClaim()}
        title="Why 10–20 credited sets"
      />
    </Card>
  );
}
