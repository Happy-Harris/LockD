import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { Page } from "@/components/app/shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  estimateMax,
  parseDecimal,
  percentTable,
  rirFromRpe,
  roundToLoadable,
  targetLoad,
  type LiftMathError,
  type LiftMathResult,
} from "@/domain/liftMath";
import { FORMULA_LABEL } from "@/domain/oneRepMax";
import type { OneRepMaxFormula } from "@/domain/types";
import { weightUnitFor, type WeightUnit } from "@/domain/units";
import { useGym } from "@/lib/gym/store";

/**
 * Lift Math, step B (owner's spec, Appendix A; plan addendum § 6 item 8). The calculator on the shared
 * e1RM core: an estimated 1RM from a set, or the load for a target set. Every result carries its receipt
 * (formula and inputs) and the other formula's answer. Inputs live in the address, so Back from the plate
 * calculator returns them intact; nothing is written to the log, the plates or settings.
 */

type Mode = "max" | "load";

type LiftMathSearch = {
  mode?: Mode;
  load?: string;
  reps?: string;
  effort?: string;
  max?: string;
  treps?: string;
  teffort?: string;
};

/** A typed value from the address. A hand-typed `?load=100` arrives as a number, so both are accepted. */
const text = (value: unknown) =>
  (typeof value === "string" || typeof value === "number") && String(value).length <= 12 ? String(value) : undefined;

export const Route = createFileRoute("/tools_/lift-math")({
  validateSearch: (search: Record<string, unknown>): LiftMathSearch => ({
    mode: search.mode === "load" ? "load" : search.mode === "max" ? "max" : undefined,
    load: text(search.load),
    reps: text(search.reps),
    effort: text(search.effort),
    max: text(search.max),
    treps: text(search.treps),
    teffort: text(search.teffort),
  }),
  component: LiftMathPage,
});

/** Spec copy deck: plain, no motivation language. */
export const LIFT_MATH_COPY = {
  resultLabel: "Estimated 1RM",
  targetLabel: "Estimated load",
  roundedLabel: (step: string) => `Nearest loadable · ${step} steps`,
  caveat:
    "An estimate. Reps at a given percentage vary by person and by lift — set the load from how your first set moves.",
  overCap: "Reps plus RIR can't go past 12. Beyond that, these formulas stop being useful.",
  invalidLoad: "Enter a load above 0.",
  invalidReps: "Enter whole reps, 1 or more.",
  invalidEffort: (rpe: boolean) => (rpe ? "Enter an RPE from 1 to 10, in half steps." : "Enter an RIR of 0 or more, in half steps."),
} as const;

const OTHER: Record<OneRepMaxFormula, OneRepMaxFormula> = { epley: "brzycki", brzycki: "epley" };

/** Up to two decimals, no trailing zeros: 116.67, 87.5, 140. */
const num = (value: number) => String(Number(value.toFixed(2)));
const withUnit = (value: number, unit: WeightUnit) => `${num(value)} ${unit}`;

/** A typed value as a number: undefined when blank, NaN when it is not a number. */
const read = (raw: string | undefined) => {
  const value = parseDecimal(raw ?? "");
  return value === null ? Number.NaN : value;
};

/** The RIR the lifter meant, from the field the log uses (RPE or RIR). Blank is RIR 0. */
function rirOf(raw: string | undefined, rpe: boolean): number {
  const value = read(raw);
  if (value === undefined) return 0;
  if (!rpe) return value;
  return value >= 1 && value <= 10 ? rirFromRpe(value) : Number.NaN;
}

function errorText(error: LiftMathError, rpe: boolean): string | null {
  switch (error) {
    case "empty":
      return null;
    case "invalid_load":
      return LIFT_MATH_COPY.invalidLoad;
    case "invalid_reps":
      return LIFT_MATH_COPY.invalidReps;
    case "invalid_rir":
      return LIFT_MATH_COPY.invalidEffort(rpe);
    case "over_cap":
      return LIFT_MATH_COPY.overCap;
  }
}

/** Which field an error belongs to, so it is linked to that field for a screen reader. */
const FIELD_OF: Record<LiftMathError, "load" | "reps" | "effort" | null> = {
  empty: null,
  invalid_load: "load",
  invalid_reps: "reps",
  invalid_rir: "effort",
  over_cap: "reps",
};

function LiftMathPage() {
  const settings = useGym((s) => s.settings);
  const unit = weightUnitFor(settings.unitSystem);
  const formula = settings.oneRepMaxFormula;
  const rpe = settings.intensityMode === "rpe";
  const step = unit === "kg" ? 2.5 : 5;
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const mode: Mode = search.mode ?? "max";
  const set = (patch: Partial<LiftMathSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const setInputs = { load: read(search.load), reps: read(search.reps), rir: rirOf(search.effort, rpe) };
  const targetInputs = { oneRm: read(search.max), reps: read(search.treps), rir: rirOf(search.teffort, rpe) };
  const result: LiftMathResult =
    mode === "max"
      ? estimateMax({ ...setInputs, formula })
      : targetLoad({ ...targetInputs, formula });
  const other: LiftMathResult =
    mode === "max"
      ? estimateMax({ ...setInputs, formula: OTHER[formula] })
      : targetLoad({ ...targetInputs, formula: OTHER[formula] });

  const effortLabel = rpe ? "RPE on that set" : "RIR on that set";
  const targetEffortLabel = rpe ? "Target RPE" : "Target RIR";
  const effortValue = (raw: string | undefined) => (rpe ? (raw ? `RPE ${raw.replace(",", ".")}` : "RPE 10") : `RIR ${raw ? raw.replace(",", ".") : "0"}`);

  const error = result.ok ? null : errorText(result.error, rpe);
  const errorField = result.ok ? null : FIELD_OF[result.error];
  const ids = { load: useId(), reps: useId(), effort: useId(), error: useId() };
  const describe = (field: "load" | "reps" | "effort") => (errorField === field ? ids.error : undefined);

  const rounded = result.ok && mode === "load" ? roundToLoadable(result.value, step) : null;
  const receipt = result.ok
    ? mode === "max"
      ? `${FORMULA_LABEL[formula]} · ${withUnit(setInputs.load!, unit)} × ${setInputs.reps} at ${effortValue(search.effort)}`
      : `${FORMULA_LABEL[formula]} · 1RM ${withUnit(targetInputs.oneRm!, unit)}, ${targetInputs.reps} reps at ${effortValue(search.teffort)}`
    : null;
  const announcement = result.ok
    ? mode === "max"
      ? `${LIFT_MATH_COPY.resultLabel} ${withUnit(result.value, unit)}`
      : `${LIFT_MATH_COPY.targetLabel} ${withUnit(result.value, unit)}, nearest loadable ${withUnit(rounded!, unit)}`
    : (error ?? "");
  const announced = useSettled(announcement);

  return (
    <Page>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Lift Math</h1>
      <p className="mt-1 text-sm text-muted">An estimated 1RM from a set, or the load for a target set. Nothing here is saved.</p>

      <div className="mt-5 grid grid-cols-2 gap-2" role="group" aria-label="What to work out">
        {(
          [
            ["max", LIFT_MATH_COPY.resultLabel],
            ["load", LIFT_MATH_COPY.targetLabel],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => set({ mode: id })}
            className={
              mode === id
                ? "min-h-11 rounded-xl bg-accent text-sm text-accent-ink"
                : "min-h-11 rounded-xl bg-raised text-sm"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "max" ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Field id={ids.load} label={`Load (${unit})`} value={search.load} describedBy={describe("load")} onChange={(load) => set({ load })} />
          <Field id={ids.reps} label="Reps" value={search.reps} numeric describedBy={describe("reps")} onChange={(reps) => set({ reps })} />
          <Field id={ids.effort} label={effortLabel} value={search.effort} placeholder={rpe ? "10" : "0"} describedBy={describe("effort")} onChange={(effort) => set({ effort })} />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Field id={ids.load} label={`1RM (${unit})`} value={search.max} describedBy={describe("load")} onChange={(max) => set({ max })} />
          <Field id={ids.reps} label="Reps" value={search.treps} numeric describedBy={describe("reps")} onChange={(treps) => set({ treps })} />
          <Field id={ids.effort} label={targetEffortLabel} value={search.teffort} placeholder={rpe ? "10" : "0"} describedBy={describe("effort")} onChange={(teffort) => set({ teffort })} />
        </div>
      )}

      <p aria-live="polite" className="sr-only" data-testid="lift-math-announce">
        {announced}
      </p>

      {error ? (
        <p id={ids.error} className="mt-3 text-sm text-warning" data-testid="lift-math-error">
          {error}
        </p>
      ) : null}

      {result.ok ? (
        <Card className="mt-4" data-testid="lift-math-result">
          <p className="text-xs uppercase tracking-[0.16em] text-subtle">
            {mode === "max" ? LIFT_MATH_COPY.resultLabel : LIFT_MATH_COPY.targetLabel}
            {result.rirAdjusted ? " · RIR-adjusted" : ""}
          </p>
          <p className="mt-1 font-display text-4xl font-semibold tabular">{withUnit(result.value, unit)}</p>
          {rounded !== null ? (
            <p className="mt-2 text-sm" data-testid="lift-math-rounded">
              <span className="text-muted">{LIFT_MATH_COPY.roundedLabel(`${step} ${unit}`)}: </span>
              <span className="font-semibold tabular">{withUnit(rounded, unit)}</span>
            </p>
          ) : null}
          <p className="mt-3 font-mono text-xs text-muted" data-testid="lift-math-receipt">
            {receipt}
          </p>
          {other.ok ? (
            <p className="font-mono text-xs text-subtle" data-testid="lift-math-other">
              {FORMULA_LABEL[OTHER[formula]]}: {withUnit(other.value, unit)}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {mode === "max" ? (
              <button
                type="button"
                className="min-h-11 rounded-xl bg-raised px-3 text-sm"
                onClick={() => set({ mode: "load", max: num(result.value) })}
              >
                Use as 1RM for a target
              </button>
            ) : (
              <>
                <Link
                  to="/tools/plates"
                  search={{ load: num(rounded!), unit }}
                  className="grid min-h-11 place-items-center rounded-xl bg-raised px-3 text-sm"
                >
                  Load it on the bar
                </Link>
                <Link
                  to="/tools/warmup"
                  search={{ load: num(rounded!), unit }}
                  className="grid min-h-11 place-items-center rounded-xl bg-raised px-3 text-sm"
                >
                  Warm up to it
                </Link>
              </>
            )}
          </div>
        </Card>
      ) : null}

      {result.ok && mode === "max" ? (
        <Card className="mt-3" data-testid="lift-math-percent">
          <p className="text-xs uppercase tracking-[0.16em] text-subtle">
            Percent of {withUnit(result.value, unit)} · {step} {unit} steps
          </p>
          <ul className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1 font-mono text-sm tabular">
            {percentTable(result.value, step).map((row) => (
              <li key={row.percent} className="flex justify-between gap-2">
                <span className="text-subtle">{row.percent}%</span>
                <span>{num(row.load)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="mt-4 text-xs text-subtle">{LIFT_MATH_COPY.caveat}</p>
    </Page>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  numeric = false,
  placeholder,
  describedBy,
}: {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  numeric?: boolean;
  placeholder?: string;
  describedBy?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block min-h-8 text-xs uppercase tracking-[0.14em] text-subtle">
        {label}
      </label>
      <Input
        id={id}
        inputMode={numeric ? "numeric" : "decimal"}
        value={value ?? ""}
        placeholder={placeholder}
        aria-invalid={describedBy ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** The value once it has stopped changing, so a screen reader hears one result per settled input. */
function useSettled(value: string, delayMs = 600): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
