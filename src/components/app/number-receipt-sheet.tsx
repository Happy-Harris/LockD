import { Link } from "@tanstack/react-router";
import { Sheet } from "@/components/ui/sheet";
import { EXCLUSION_LABEL } from "@/domain/provenance";
import { formatLocalDate } from "@/domain/time";
import type { WorkoutSet } from "@/domain/types";
import { formatWeightWithUnit, roundEstimateG, type WeightUnit } from "@/domain/units";
import type { E1rmPoint, E1rmReceipt } from "@/lib/gym/number-receipts";

/** Sessions the trend lists before pointing to the lift page for the rest. */
export const RECEIPT_TREND_ROWS = 12;

const day = (date: string) => formatLocalDate(date, { day: "numeric", month: "short", year: "numeric" });

function setText(set: WorkoutSet, unit: WeightUnit): string {
  const type = set.setType === "warmup" ? "W " : set.setType === "drop" ? "D " : set.setType === "failure" ? "F " : "";
  const load = set.weightG ? formatWeightWithUnit(set.weightG, unit) : "no load";
  return `${type}${load} × ${set.reps ?? "—"}${set.side ? ` (${set.side === "left" ? "L" : "R"})` : ""}`;
}

/** An estimate as every e1RM on screen shows it: to 0.5 kg or 1 lb (Step 8d-1). */
const est = (grams: number, unit: WeightUnit) => formatWeightWithUnit(roundEstimateG(grams, unit), unit);

const pointText = (point: E1rmPoint, unit: WeightUnit) =>
  `${est(point.valueG, unit)} from ${formatWeightWithUnit(point.weightG, unit)} × ${point.reps}`;

/**
 * Opp 4: one sheet for the working behind an estimated 1RM, a record, and the trend they sit on:
 * the formula, the set the number came from, every set used and every set left out with the reason,
 * the best before this session, and the lift's estimate session by session, each date openable.
 */
export function NumberReceiptSheet({
  open,
  onClose,
  lift,
  receipt,
  unit,
  record = false,
}: {
  open: boolean;
  onClose: () => void;
  lift: string;
  receipt: E1rmReceipt;
  unit: WeightUnit;
  /** Worded as a new record: what it beat, and by how much. */
  record?: boolean;
}) {
  const { provenance, previous } = receipt;
  const best = provenance.best;
  const trend = [...receipt.trend].reverse();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={record ? `${lift}: new estimated 1RM` : `${lift}: estimated 1RM`}
      description={`${day(receipt.date)} · ${provenance.formulaLabel}`}
    >
      <div className="space-y-4 text-sm" data-testid="number-receipt">
        {best ? (
          <div>
            <p className="font-display text-3xl font-semibold tabular">{est(best.value, unit)}</p>
            <p className="mt-1 text-muted">
              From {setText(best.set, unit)}, the best estimate of the session.
            </p>
            <p className="mt-2 rounded-lg bg-raised px-3 py-2 font-mono text-xs text-muted">
              {provenance.formulaLabel}: {provenance.expression}. One rep is the load itself. Shown to{" "}
              {unit === "kg" ? "0.5 kg" : "1 lb"}.
            </p>
          </div>
        ) : (
          <p className="text-muted">No set in this session can give an estimate.</p>
        )}

        {record ? (
          <p data-testid="number-receipt-previous">
            {previous && best
              ? `Beats ${pointText(previous, unit)} on ${day(previous.date)}, by ${formatWeightWithUnit(roundEstimateG(best.value, unit) - roundEstimateG(previous.valueG, unit), unit)}.`
              : "First session of this lift on file: a baseline, not a record."}
          </p>
        ) : previous ? (
          <p className="text-muted" data-testid="number-receipt-previous">
            Best before this session: {pointText(previous, unit)} on {day(previous.date)}.
          </p>
        ) : null}

        <section>
          <h3 className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">Sets used</h3>
          <ul className="mt-1 space-y-1 font-mono text-xs tabular">
            {provenance.used.map(({ set, valueG }) => (
              <li key={set.id} className="flex justify-between gap-3">
                <span>{setText(set, unit)}</span>
                <span className={best?.set.id === set.id ? "text-ink" : "text-muted"}>
                  {est(valueG, unit)}
                  {best?.set.id === set.id ? " · best" : ""}
                </span>
              </li>
            ))}
            {provenance.used.length === 0 ? <li className="text-muted">None</li> : null}
          </ul>
        </section>

        {provenance.excluded.length > 0 ? (
          <section>
            <h3 className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">Left out</h3>
            <ul className="mt-1 space-y-1 font-mono text-xs tabular text-muted" data-testid="number-receipt-excluded">
              {provenance.excluded.map(({ set, reason }) => (
                <li key={set.id} className="flex justify-between gap-3">
                  <span className="whitespace-nowrap">{setText(set, unit)}</span>
                  <span className="text-right">{EXCLUSION_LABEL[reason]}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h3 className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">
            Session by session ({receipt.trend.length})
          </h3>
          <ul className="mt-1 font-mono text-xs tabular" data-testid="number-receipt-trend">
            {trend.slice(0, RECEIPT_TREND_ROWS).map((point) => (
              <li key={point.workoutId}>
                <Link
                  to="/history/$id"
                  params={{ id: point.workoutId }}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-1 hover:bg-raised"
                  aria-label={`Open the ${lift} session on ${day(point.date)}`}
                >
                  <span className={point.workoutId === receipt.workoutId ? "text-ink" : "text-accent"}>
                    {day(point.date)}
                  </span>
                  <span className="text-muted">{pointText(point, unit)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {trend.length > RECEIPT_TREND_ROWS ? (
            <p className="mt-1 text-xs text-subtle">
              And {trend.length - RECEIPT_TREND_ROWS} earlier sessions, listed on the lift page.
            </p>
          ) : null}
        </section>
      </div>
    </Sheet>
  );
}
