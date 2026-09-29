import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import type { WeightUnit } from "@/domain/units";
import {
  metricEvidenceFor,
  type MetricEvidence,
  type VerdictEvidenceKey,
  type WeeklyMetrics,
  type WeeklyVerdict,
} from "@/domain/analytics/weeklyVerdict";
import { metricsFor } from "@/domain/analytics/weeklyVerdict.metrics";
import { formatDateRange, formatMetric, formatWeight } from "@/domain/analytics/weeklyVerdict.util";

/** The logged weeks and the arithmetic behind one number of the weekly verdict (or all of them). */
export function VerdictEvidenceSheet({
  open,
  onClose,
  verdict,
  weightUnit,
  focusKey,
}: {
  open: boolean;
  onClose: () => void;
  verdict: WeeklyVerdict;
  weightUnit: WeightUnit;
  focusKey?: VerdictEvidenceKey;
}) {
  const focused = focusKey ? metricEvidenceFor(verdict, focusKey, weightUnit, null) : null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={focused ? `${focused.label} evidence` : "Weekly verdict evidence"}
      description="The logged weeks and the calculation behind this number."
      size="lg"
    >
      <div className="space-y-4 text-sm" data-testid="verdict-evidence">
        {focused ? (
          <FocusedMetricEvidence evidence={focused} />
        ) : (
          <OverviewEvidence verdict={verdict} weightUnit={weightUnit} />
        )}
      </div>
    </Sheet>
  );
}

function FocusedMetricEvidence({ evidence }: { evidence: MetricEvidence }) {
  return (
    <>
      <Card className="p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Formula</p>
        <p className="mt-1 font-medium text-ink">{evidence.label}</p>
        <p className="mt-1 text-muted">{evidence.formula}</p>
      </Card>

      <section aria-labelledby="subject-metric-evidence">
        <h3 id="subject-metric-evidence" className="font-semibold text-ink">
          {evidence.subjectLabel}
        </h3>
        <p className="mt-1 text-base font-semibold tabular-nums text-ink">
          {evidence.subjectValue}
        </p>
      </section>

      <section aria-labelledby="baseline-metric-evidence">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 id="baseline-metric-evidence" className="font-semibold text-ink">
              Baseline weeks
            </h3>
            <p className="text-xs text-subtle">Date range and value for each selected week.</p>
          </div>
          <span className="text-xs font-semibold text-accent">Mean {evidence.baselineMean}</span>
        </div>
        <div className="mt-2 overflow-x-auto rounded-lg hairline">
          <table className="w-full min-w-[22rem] text-left text-xs">
            <thead className="bg-raised text-subtle">
              <tr>
                <th className="px-3 py-2" scope="col">
                  Week
                </th>
                <th className="px-3 py-2 text-right" scope="col">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {evidence.baselineWeeks.map((week) => (
                <tr key={week.startDate} className="border-t border-line text-muted">
                  <th className="px-3 py-2 font-medium text-ink" scope="row">
                    {formatDateRange(week.startDate, week.endDate)}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{week.value}</td>
                </tr>
              ))}
              <tr className="border-t border-line bg-raised font-semibold text-ink">
                <th className="px-3 py-2" scope="row">
                  Mean
                </th>
                <td className="px-3 py-2 text-right tabular-nums">{evidence.baselineMean}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function OverviewEvidence({
  verdict,
  weightUnit,
}: {
  verdict: WeeklyVerdict;
  weightUnit: WeightUnit;
}) {
  return (
    <>
      <Card className="p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Formula</p>
        <p className="mt-1 font-medium text-ink">Completed working sets only</p>
        <p className="mt-1 text-muted">
          Direction compares the last completed week&rsquo;s hard sets with the mean of the selected
          prior training weeks. Warm-up, drop and failure sets do not count.
        </p>
      </Card>

      <section aria-labelledby="subject-week-evidence">
        <h3 id="subject-week-evidence" className="font-semibold text-ink">
          Last completed week
        </h3>
        <p className="text-xs text-subtle">
          {formatDateRange(verdict.subject.startDate, verdict.subject.endDate)}
        </p>
        <MetricRow metrics={verdict.subject.metrics} weightUnit={weightUnit} />
      </section>

      <section aria-labelledby="baseline-evidence">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 id="baseline-evidence" className="font-semibold text-ink">
              Baseline weeks
            </h3>
            <p className="text-xs text-subtle">Weeks with something logged, oldest to newest.</p>
          </div>
          <span className="text-xs font-semibold text-accent">
            {verdict.baseline.weeks.length}-week mean
          </span>
        </div>
        <div className="mt-2 overflow-x-auto rounded-lg hairline">
          <table className="w-full min-w-[30rem] text-left text-xs">
            <thead className="bg-raised text-subtle">
              <tr>
                <th className="px-3 py-2" scope="col">
                  Week
                </th>
                <th className="px-3 py-2 text-right" scope="col">
                  Hard sets
                </th>
                <th className="px-3 py-2 text-right" scope="col">
                  Sessions
                </th>
                <th className="px-3 py-2 text-right" scope="col">
                  Tonnage
                </th>
              </tr>
            </thead>
            <tbody>
              {verdict.baseline.weeks.map((week) => {
                const metrics = metricsFor(week.entries);
                return (
                  <tr key={week.startDate} className="border-t border-line text-muted">
                    <th className="px-3 py-2 font-medium text-ink" scope="row">
                      {formatDateRange(week.startDate, week.endDate)}
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">{metrics.hardSets}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {metrics.sessions || week.sessionCount}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatWeight(metrics.tonnageG, weightUnit)} {weightUnit}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-line bg-raised font-semibold text-ink">
                <th className="px-3 py-2" scope="row">
                  Mean
                </th>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMetric(verdict.baseline.metrics.hardSets)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMetric(verdict.baseline.metrics.sessions)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatWeight(verdict.baseline.metrics.tonnageG, weightUnit)} {weightUnit}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {verdict.pulse ? (
        <section aria-labelledby="pulse-evidence">
          <h3 id="pulse-evidence" className="font-semibold text-ink">
            Same-span comparison
          </h3>
          <p className="mt-1 text-muted">
            <span className="font-semibold tabular-nums text-ink">
              {formatMetric(verdict.pulse.currentHardSets)} vs{" "}
              {formatMetric(verdict.pulse.baselineHardSetsAverage)} hard sets
            </span>{" "}
            by this point in the week.
          </p>
          <p className="mt-1 text-xs text-subtle">
            The current week is compared only with the identical elapsed-day slice of the{" "}
            {verdict.pulse.baselineWeeks} selected baseline weeks. It is never compared with full
            weeks.
          </p>
        </section>
      ) : null}
    </>
  );
}

function MetricRow({ metrics, weightUnit }: { metrics: WeeklyMetrics; weightUnit: WeightUnit }) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      <Metric label="Hard sets" value={`${formatMetric(metrics.hardSets)} hard sets`} />
      <Metric label="Sessions" value={`${formatMetric(metrics.sessions)} sessions`} />
      <Metric
        label="Tonnage"
        value={`${formatWeight(metrics.tonnageG, weightUnit)} ${weightUnit}`}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-raised p-2">
      <p className="text-[11px] uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
