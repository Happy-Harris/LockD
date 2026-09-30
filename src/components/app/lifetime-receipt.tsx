import { LockdMark } from "@/components/app/mark";
import { formatLocalDate } from "@/domain/time";
import { formatWeightWithUnit, type WeightUnit } from "@/domain/units";
import type { LifetimeReceipt } from "@/lib/receipt/web-receipt";

const FORMULA_LABEL = { epley: "Epley", brzycki: "Brzycki" } as const;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const day = (date: string) =>
  formatLocalDate(date, { day: "numeric", month: "short", year: "numeric" });

/**
 * The lifetime receipt (Opp 2): the whole record on one receipt. Drawn on `/receipt` from a file read on the device,
 * and on `/s/$id` when a lifter publishes it (Opp 9).
 */
export function LifetimeReceiptView({
  receipt,
  unit,
  innerRef,
}: {
  receipt: LifetimeReceipt;
  unit: WeightUnit;
  innerRef?: React.Ref<HTMLElement>;
}) {
  const { chronicle } = receipt;
  const firstYear = receipt.firstDate.slice(0, 4);
  const lastYear = receipt.lastDate.slice(0, 4);
  const most = Math.max(...receipt.years.map((row) => row.sessions));
  return (
    <article ref={innerRef} className="receipt mt-4 px-5 py-6" data-testid="web-receipt">
      <header className="flex items-start justify-between border-b border-dashed border-current/20 pb-4">
        <div>
          <p className="stamp text-4xl leading-none">LOCKD</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.22em] opacity-60">
            Training receipt {firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`}
          </p>
        </div>
        <LockdMark className="size-9" />
      </header>

      <dl className="mt-5 grid grid-cols-2 gap-4 border-b border-dashed border-current/20 pb-5">
        <Stat label="Sessions" value={receipt.sessions} />
        <Stat label="Hard sets" value={receipt.hardSets} />
        <Stat label="Lifts" value={receipt.lifts} />
        <Stat label="Layoffs" value={chronicle.layoffs} />
      </dl>

      <p className="mt-5 text-sm" data-testid="web-receipt-span">
        {day(receipt.firstDate)} to {day(receipt.lastDate)}: {plural(chronicle.eraCount, "era")}
        {chronicle.briefReturns ? ` and ${plural(chronicle.briefReturns, "brief return")}` : ""}.
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {chronicle.eras.map((era) => (
          <li key={era.id} className="flex items-baseline justify-between gap-3">
            <span className={era.tone === "brief" ? "opacity-60" : "font-medium"}>{era.name}</span>
            <span className="text-right text-xs opacity-60">
              {era.tone === "brief" ? day(era.startDate) : plural(era.sessions, "session")}
            </span>
          </li>
        ))}
      </ul>
      {chronicle.earlier ? (
        <p className="mt-1 text-xs opacity-60">and {chronicle.earlier} earlier.</p>
      ) : null}

      <div className="mt-5 border-t border-dashed border-current/20 pt-4">
        <p className="text-[11px] uppercase tracking-[0.16em] opacity-55">Sessions by year</p>
        <ul className="mt-2 space-y-1" data-testid="web-receipt-years">
          {receipt.years.map((row) => (
            <li key={row.year} className="flex items-center gap-3 text-sm tabular">
              <span className="w-10 shrink-0">{row.year}</span>
              <span className="h-2 flex-1 rounded-full bg-current/10">
                <span
                  className="block h-2 rounded-full bg-accent"
                  style={{ width: most ? `${(row.sessions / most) * 100}%` : 0 }}
                />
              </span>
              <span className="w-10 shrink-0 text-right">{row.sessions}</span>
            </li>
          ))}
        </ul>
      </div>

      {receipt.topLifts.length ? (
        <div className="mt-5 border-t border-dashed border-current/20 pt-4">
          <p className="text-[11px] uppercase tracking-[0.16em] opacity-55">Most-logged lifts</p>
          <ul className="mt-2 space-y-2 text-sm" data-testid="web-receipt-lifts">
            {receipt.topLifts.map((lift) => (
              <li key={lift.name}>
                <span className="font-medium">{lift.name}</span>, {plural(lift.sessions, "session")}.
                Best estimate {formatWeightWithUnit(lift.e1rmG, unit)}, from{" "}
                {formatWeightWithUnit(lift.weightG, unit)} × {lift.reps} on {day(lift.date)}.
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs opacity-60">
            Estimates use the {FORMULA_LABEL[receipt.formula]} formula on each lift’s best set;
            warm-ups are left out.
          </p>
        </div>
      ) : null}

      <p className="mt-6 border-t border-dashed border-current/20 pt-4 text-[11px] uppercase tracking-[0.18em] opacity-55">
        Keep the receipt. Busiest {receipt.busiestYears.years.length > 1 ? "years" : "year"}{" "}
        {receipt.busiestYears.years.join(" and ")}, {plural(receipt.busiestYears.sessions, "session")}
        {receipt.busiestYears.years.length > 1 ? " each" : ""}.
        {receipt.longestGap
          ? ` Longest gap ${receipt.longestGap.days} days, ${day(receipt.longestGap.from)} to ${day(receipt.longestGap.to)}.`
          : ""}
      </p>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.16em] opacity-55">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-semibold tabular">{value}</dd>
    </div>
  );
}
