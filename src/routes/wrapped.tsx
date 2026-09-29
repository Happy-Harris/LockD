import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Page } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { formatWeightWithUnit, weightUnitFor } from "@/domain/units";
import { useGymDerived } from "@/lib/gym/hooks";
import { availableYears, buildYearReceipt } from "@/lib/gym/wrapped";
import { LockdMark } from "@/components/app/mark";
import { PublishButton } from "@/components/app/publish-button";
import { wrappedShare } from "@/lib/cloud/shares";

export const Route = createFileRoute("/wrapped")({ component: WrappedPage });

function WrappedPage() {
  const { slices, chronicle, measurements, settings } = useGymDerived();
  const years = availableYears(slices);
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear());
  const unit = weightUnitFor(settings.unitSystem);
  const receipt = useMemo(
    () => buildYearReceipt(year, slices, chronicle.eras, measurements, settings.oneRepMaxFormula),
    [year, slices, chronicle.eras, measurements, settings.oneRepMaxFormula],
  );

  return (
    <Page>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">Yearly receipt</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">The year, on paper.</h1>
      <div className="mt-4 flex gap-2">
        {years.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setYear(item)}
            className={
              year === item ? "h-10 rounded-full bg-accent px-4 text-sm text-accent-ink" : "h-10 rounded-full bg-raised px-4 text-sm hairline"
            }
          >
            {item}
          </button>
        ))}
      </div>

      <article className="receipt mt-6 px-5 py-6">
        <header className="flex items-start justify-between border-b border-dashed border-current/20 pb-4">
          <div>
            <p className="stamp text-4xl leading-none">LOCKD</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.22em] opacity-60">Training receipt {receipt.year}</p>
          </div>
          <LockdMark className="size-9" />
        </header>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-b border-dashed border-current/20 pb-5">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.16em] opacity-55">Sessions</dt>
            <dd className="mt-1 font-display text-3xl font-semibold tabular">{receipt.sessions}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.16em] opacity-55">Hard sets</dt>
            <dd className="mt-1 font-display text-3xl font-semibold tabular">{receipt.hardSets}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.16em] opacity-55">Lifts</dt>
            <dd className="mt-1 font-display text-3xl font-semibold tabular">{receipt.uniqueLifts}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.16em] opacity-55">Longest gap</dt>
            <dd className="mt-1 font-display text-3xl font-semibold tabular">{receipt.longestLayoffDays}d</dd>
          </div>
        </dl>
        {receipt.topLift ? (
          <p className="mt-5 text-sm">
            Strongest stamp: {receipt.topLift.name} {formatWeightWithUnit(receipt.topLift.e1rmG, unit)} e1RM.
          </p>
        ) : null}
        {receipt.eras.length ? (
          <p className="mt-3 text-sm">Eras: {receipt.eras.join(" · ")}.</p>
        ) : null}
        {receipt.firsts.length ? (
          <p className="mt-3 text-sm">Firsts: {receipt.firsts.join("; ")}.</p>
        ) : (
          <p className="mt-3 text-sm opacity-60">No named firsts this year.</p>
        )}
        {receipt.comeback ? <p className="mt-3 text-sm">Comeback session: {receipt.comeback}.</p> : null}
        {receipt.bodyDelta ? (
          <p className="mt-3 text-sm">
            Bodyweight {formatWeightWithUnit(receipt.bodyDelta.from, unit)} → {formatWeightWithUnit(receipt.bodyDelta.to, unit)}.
          </p>
        ) : null}
        <p className="mt-6 border-t border-dashed border-current/20 pt-4 text-[10px] uppercase tracking-[0.18em] opacity-55">
          Keep the receipt. Busiest month {receipt.busiestMonth}.
        </p>
      </article>

      <div className="mt-6">
        <PublishButton
          kind="wrapped"
          title={`Training receipt ${receipt.year}`}
          payload={wrappedShare(receipt, unit)}
          label="Share yearly receipt"
        />
      </div>
      <Button className="mt-2 w-full" variant="secondary" asChild>
        <Link to="/chronicle">Back to chronicle</Link>
      </Button>
    </Page>
  );
}
