import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Page } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MEASUREMENT_METRICS, metricKind, metricLabel } from "@/domain/taxonomy";
import type { MeasurementMetric } from "@/domain/types";
import {
  formatLength,
  formatWeight,
  lengthUnitFor,
  toGrams,
  toMillimetres,
  weightUnitFor,
} from "@/domain/units";
import { useGym } from "@/lib/gym/store";

export const Route = createFileRoute("/body")({ component: BodyPage });

function BodyPage() {
  const measurements = useGym((s) => s.measurements);
  const settings = useGym((s) => s.settings);
  const addMeasurement = useGym((s) => s.addMeasurement);
  const [metric, setMetric] = useState<MeasurementMetric>("bodyweight");
  const [value, setValue] = useState("");
  const massUnit = weightUnitFor(settings.unitSystem);
  const lenUnit = lengthUnitFor(settings.unitSystem);
  const kind = metricKind(metric);

  const byMetric = useMemo(() => {
    const map = new Map<MeasurementMetric, typeof measurements>();
    for (const row of measurements) {
      const list = map.get(row.metric) ?? [];
      list.push(row);
      map.set(row.metric, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.localDate.localeCompare(b.localDate));
    return map;
  }, [measurements]);

  const selected = byMetric.get(metric) ?? [];
  const series = selected.map((row) => ({
    date: row.localDate.slice(5),
    value:
      metricKind(row.metric) === "mass"
        ? Number(formatWeight(row.value, massUnit))
        : Number(formatLength(row.value, lenUnit)),
  }));
  const latest = selected[selected.length - 1];
  const first = selected[0];
  const delta = latest && first ? latest.value - first.value : 0;

  return (
    <Page>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Body</h1>
      <p className="mt-1 text-sm text-muted">Weight and circumferences, stored as integers. Units are display-only.</p>

      <form
        className="mt-5 rounded-2xl bg-surface p-4 hairline"
        onSubmit={(event) => {
          event.preventDefault();
          const numeric = Number(value.replace(",", "."));
          if (!Number.isFinite(numeric) || numeric <= 0) return;
          if (kind === "mass") addMeasurement(metric, toGrams(numeric, massUnit), massUnit);
          else addMeasurement(metric, toMillimetres(numeric, lenUnit), lenUnit);
          setValue("");
        }}
      >
        <div className="flex gap-2 overflow-x-auto pb-2">
          {MEASUREMENT_METRICS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              onClick={() => setMetric(entry.value)}
              className={
                metric === entry.value
                  ? "h-9 shrink-0 rounded-full bg-accent px-3 text-xs text-accent-ink"
                  : "h-9 shrink-0 rounded-full bg-raised px-3 text-xs text-muted"
              }
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={kind === "mass" ? massUnit : lenUnit}
          />
          <Button type="submit">Log</Button>
        </div>
      </form>

      {latest ? (
        <Card className="mt-4">
          <p className="text-xs uppercase tracking-[0.16em] text-subtle">{metricLabel(metric)}</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular">
            {kind === "mass" ? `${formatWeight(latest.value, massUnit)} ${massUnit}` : `${formatLength(latest.value, lenUnit)} ${lenUnit}`}
          </p>
          {latest.source ? (
            <p className="mt-1 text-xs text-muted" data-testid="body-source">
              Latest reading from {latest.source === "apple_health" ? "Apple Health" : "Health Connect"}, {latest.localDate}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted">
            Change since first entry:{" "}
            {kind === "mass"
              ? `${delta >= 0 ? "+" : ""}${formatWeight(delta, massUnit)} ${massUnit}`
              : `${delta >= 0 ? "+" : ""}${formatLength(delta, lenUnit)} ${lenUnit}`}
          </p>
          {series.length > 1 ? (
            <div className="mt-3 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series}>
                  <Area type="monotone" dataKey="value" stroke="var(--rf-accent)" fill="var(--rf-accent)" fillOpacity={0.16} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </Card>
      ) : (
        <p className="mt-6 text-sm text-muted">No entries for {metricLabel(metric)} yet.</p>
      )}
    </Page>
  );
}
