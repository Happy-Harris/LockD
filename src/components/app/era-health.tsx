import { formatAsleep, type EraHealthOverlay, type HealthLine, type HealthReceiptRow } from "@/domain/health";
import { formatLocalDate } from "@/domain/time";
import { formatWeightWithUnit, type WeightUnit } from "@/domain/units";
import { HEALTH_MIN_SAMPLES } from "@/domain/health";

/**
 * Health context under an era (Opp 10). Counts, medians and the readings behind them, side by side with the
 * training record. No score, no good or bad colour, and no claim that any of it caused a result. Missing data
 * is said out loud, never shown as zero.
 */

const SOURCE_LABEL: Record<string, string> = {
  manual: "typed in",
  apple_health: "Apple Health",
  health_connect: "Health Connect",
};

const day = (date: string) => formatLocalDate(date, { day: "numeric", month: "short" });

function Receipt({ rows, format }: { rows: HealthReceiptRow[]; format: (value: number) => string }) {
  return (
    <details className="mt-1">
      <summary className="min-h-11 cursor-pointer py-2 text-micro text-subtle">The {rows.length} behind it</summary>
      <ul className="space-y-1 pb-2 text-micro text-muted">
        {rows.map((row, index) => (
          <li key={`${row.date}-${index}`}>
            {formatLocalDate(row.date)} · {format(row.value)} · {SOURCE_LABEL[row.source] ?? row.source}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Line({
  testId,
  label,
  unitWord,
  line,
  format,
  none,
}: {
  testId: string;
  label: string;
  unitWord: string;
  line: HealthLine;
  format: (value: number) => string;
  none: string;
}) {
  if (line.count === 0) return <p className="mt-2 text-xs text-muted" data-testid={testId}>{none}</p>;
  return (
    <div className="mt-2" data-testid={testId}>
      <p className="text-xs text-muted">
        {label}: {line.count} {line.count === 1 ? unitWord : `${unitWord}s`} on file
        {line.median !== null
          ? `, median ${format(line.median)}`
          : `, too few for a median (it needs ${HEALTH_MIN_SAMPLES})`}
      </p>
      <Receipt rows={line.rows} format={format} />
    </div>
  );
}

export function EraHealth({ overlay, unit }: { overlay: EraHealthOverlay; unit: WeightUnit }) {
  const { bodyweight, sleep, hrv } = overlay;
  const weight = (grams: number) => formatWeightWithUnit(grams, unit);
  const hasHrv = hrv.sdnn.count > 0 || hrv.rmssd.count > 0;
  return (
    <div className="mt-3 border-t border-line pt-3" data-testid="era-health">
      <p className="text-micro font-medium uppercase tracking-[0.18em] text-subtle">Health context</p>
      {bodyweight.first && bodyweight.last ? (
        <p className="mt-2 text-xs text-muted" data-testid="era-health-bodyweight">
          Bodyweight: {weight(bodyweight.first.value)} on {day(bodyweight.first.date)}
          {bodyweight.count > 1
            ? `, ${weight(bodyweight.last.value)} on ${day(bodyweight.last.date)} (${bodyweight.count} readings)`
            : " (1 reading)"}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted" data-testid="era-health-bodyweight">
          No bodyweight for this era.
        </p>
      )}
      <Line
        testId="era-health-sleep"
        label="Sleep"
        unitWord="night"
        line={sleep}
        format={formatAsleep}
        none="No sleep data for this era."
      />
      {hasHrv ? (
        <>
          {hrv.sdnn.count > 0 ? (
            <Line
              testId="era-health-hrv-sdnn"
              label="Heart rate variability (SDNN)"
              unitWord="reading"
              line={hrv.sdnn}
              format={(value) => `${value} ms`}
              none=""
            />
          ) : null}
          {hrv.rmssd.count > 0 ? (
            <Line
              testId="era-health-hrv-rmssd"
              label="Heart rate variability (RMSSD)"
              unitWord="reading"
              line={hrv.rmssd}
              format={(value) => `${value} ms`}
              none=""
            />
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-xs text-muted" data-testid="era-health-hrv">
          No heart rate variability data for this era.
        </p>
      )}
    </div>
  );
}
