import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChangeFlagsCard } from "@/components/app/change-flags-card";
import { MuscleSetsCard } from "@/components/app/muscle-sets-card";
import { Page } from "@/components/app/shell";
import { WeeklyVerdictCard } from "@/components/app/weekly-verdict-card";
import { Card } from "@/components/ui/card";
import { HEATMAP_MUSCLES, titleCase } from "@/domain/taxonomy";
import { formatWeight, formatWeightWithUnit, fromGrams, roundEstimateG, weightUnitFor } from "@/domain/units";
import { e1rmSeries } from "@/lib/gym/analytics";
import { NumberReceiptSheet } from "@/components/app/number-receipt-sheet";
import { latestE1rmReceipt } from "@/lib/gym/number-receipts";
import { useGymDerived, useSlices } from "@/lib/gym/hooks";
import { lensDef } from "@/lib/gym/lenses";
import { useGym } from "@/lib/gym/store";
import { CHART_TICK_PX, useTextSize } from "@/lib/device/text-size";

export const Route = createFileRoute("/analytics")({ component: AnalyticsPage });

function AnalyticsPage() {
  const { verdict, verdictLens, flags, muscleInsights, subjectBalance, weeks, muscles, records, settings, heat, exercises, intelligence } = useGymDerived();
  const tickPx = CHART_TICK_PX[useTextSize()];
  const updateSettings = useGym((s) => s.updateSettings);
  const unit = weightUnitFor(settings.unitSystem);
  const maxMuscle = Math.max(1, ...Object.values(muscles));
  const chartData = weeks.slice(-12).map((week) => ({
    name: week.weekStart.slice(5),
    sets: week.hardSets,
    tonnage: Math.round(fromGrams(week.tonnageG, unit)),
  }));

  const goalIds =
    settings.goalLiftIds.length > 0
      ? settings.goalLiftIds
      : records.filter((row) => row.kind === "e1rm").slice(0, 3).map((row) => row.exerciseId);

  return (
    <Page wide>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Data Lab</h1>
      <p className="mt-1 text-sm text-muted">Every number is recomputed from stored sets. Nothing is cached as truth.</p>

      <div className="mt-6 space-y-4">
        <WeeklyVerdictCard
          verdict={verdict}
          weightUnit={weightUnitFor(settings.unitSystem)}
          lens={verdictLens}
          lensLabel={lensDef(settings.goalLens).label}
          muscleBalance={subjectBalance}
          exercises={exercises}
          goalLiftIds={settings.goalLiftIds}
          onGoalLiftIdsChange={(goalLiftIds) => updateSettings({ goalLiftIds })}
          lensId={settings.goalLens}
          onLensChange={(goalLens) => updateSettings({ goalLens })}
        />
        <ChangeFlagsCard flags={flags} weightUnit={weightUnitFor(settings.unitSystem)} />
        <MuscleSetsCard
          insights={muscleInsights}
          secondaryCredit={settings.secondaryMuscleCredit}
          weightUnit={weightUnitFor(settings.unitSystem)}
          personalTargets={settings.personalMuscleTargets}
          onPersonalTargetsChange={(personalMuscleTargets) => updateSettings({ personalMuscleTargets })}
        />
      </div>

      <Card className="mt-4 h-64 p-3">
        <p className="mb-2 px-1 text-micro font-medium uppercase tracking-[0.16em] text-subtle">Weekly hard sets</p>
        <ResponsiveContainer width="100%" height="90%">
          <AreaChart data={chartData}>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "currentColor", fontSize: tickPx }} stroke="transparent" />
            <YAxis tick={{ fill: "currentColor", fontSize: tickPx }} stroke="transparent" width={tickPx > 11 ? 36 : 28} />
            <Tooltip
              contentStyle={{
                background: "var(--rf-raised)",
                border: "1px solid color-mix(in oklab, var(--rf-ink) 12%, transparent)",
                borderRadius: 12,
              }}
            />
            <Area type="monotone" dataKey="sets" stroke="var(--rf-accent)" fill="var(--rf-accent)" fillOpacity={0.18} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <section className="mt-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight">Goal lifts</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {goalIds.map((id) => (
            <GoalLiftCard key={id} id={id} name={exercises.find((row) => row.id === id)?.name ?? "Lift"} />
          ))}
        </div>
      </section>

      {intelligence.relative.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Strength to bodyweight</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {intelligence.relative.map((row) => (
              <Card key={row.exerciseId} className="p-3">
                <p className="text-xs text-muted">{row.name}</p>
                <p className="font-display text-2xl font-semibold tabular">{row.ratio.toFixed(2)}×</p>
              </Card>
            ))}
          </div>
          {intelligence.rpeDrift ? <p className="mt-3 text-sm text-muted">{intelligence.rpeDrift.note}</p> : null}
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight">This week by muscle</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {HEATMAP_MUSCLES.map((muscle) => {
            const value = muscles[muscle] ?? 0;
            return (
              <div key={muscle} className="rounded-2xl bg-surface p-3 hairline">
                <p className="text-xs text-muted">{titleCase(muscle)}</p>
                <p className="font-display text-xl font-semibold tabular">{value.toFixed(value % 1 ? 1 : 0)}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
                  <div className="h-full bg-accent" style={{ width: `${(value / maxMuscle) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight">Training calendar</h2>
        <div className="grid grid-flow-col grid-rows-7 gap-1">
          {heat.map((day) => {
            const level = day.sessions === 0 ? 0 : Math.min(4, day.sessions + 1);
            return <div key={day.date} title={day.date} className={`heat-${level} size-3 rounded-[3px]`} />;
          })}
        </div>
      </section>
    </Page>
  );
}

/** A goal lift's latest estimate and its trend; the number opens its working (Opp 4). */
function GoalLiftCard({ id, name }: { id: string; name: string }) {
  const slices = useSlices();
  const settings = useGym((s) => s.settings);
  const unit = weightUnitFor(settings.unitSystem);
  const [open, setOpen] = useState(false);
  const series = e1rmSeries(id, slices, settings.oneRepMaxFormula).map((point) => ({
    date: point.date.slice(5),
    e1rm: Number(formatWeight(point.value, unit)),
  }));
  const receipt = series.length ? latestE1rmReceipt(id, slices, settings.oneRepMaxFormula) : null;
  const latest = receipt?.provenance.best
    ? formatWeightWithUnit(roundEstimateG(receipt.provenance.best.value, unit), unit)
    : null;
  return (
    <Card>
      <Link to="/library/$id" params={{ id }} className="text-sm font-medium">
        {name}
      </Link>
      {latest && receipt ? (
        <button
          type="button"
          className="mt-1 block min-h-11 rounded-lg text-left font-display text-2xl font-semibold tabular hover:text-accent"
          onClick={() => setOpen(true)}
          data-testid="goal-e1rm"
          aria-label={`${name} latest estimated 1RM ${latest}: show the working`}
        >
          {latest}
        </button>
      ) : (
        <p className="mt-1 font-display text-2xl font-semibold tabular">—</p>
      )}
      <div className="mt-2 h-24">
        {series.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <Area type="monotone" dataKey="e1rm" stroke="var(--rf-accent)" fill="var(--rf-accent)" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-subtle">Need two sessions to plot.</p>
        )}
      </div>
      {receipt ? (
        <NumberReceiptSheet open={open} onClose={() => setOpen(false)} lift={name} receipt={receipt} unit={unit} />
      ) : null}
    </Card>
  );
}
