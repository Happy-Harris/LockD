import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { LockdMark } from "@/components/app/mark";
import { PaperShell } from "@/components/app/paper-shell";
import { downloadReceiptPng } from "@/components/app/receipt";
import { Button } from "@/components/ui/button";
import { formatLocalDate } from "@/domain/time";
import { formatWeightWithUnit, type WeightUnit } from "@/domain/units";
import { useGym } from "@/lib/gym/store";
import { storedFingerprints } from "@/lib/import/batch";
import { defaultSelection, sessionRows } from "@/lib/import/wizard";
import { receiptOg } from "@/lib/og/tags";
import { receiptFromExport, type LifetimeReceipt } from "@/lib/receipt/web-receipt";
import { cn } from "@/lib/utils";

/**
 * Opp 2: the web receipt. A public page, outside the gate and with no account: drop an export, read
 * it on this device, get the whole training life on one receipt. The page calls no server function;
 * the file never leaves the browser. "Continue in Lock'd" imports the same sessions into this
 * browser's guest log.
 */
export const Route = createFileRoute("/receipt")({
  loader: async ({ parentMatchPromise }) => ({
    origin: (await parentMatchPromise).loaderData?.origin ?? "",
  }),
  head: ({ loaderData }) => ({ meta: receiptOg(loaderData?.origin ?? "") }),
  component: ReceiptPage,
});

const FORMULA_LABEL = { epley: "Epley", brzycki: "Brzycki" } as const;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const day = (date: string) =>
  formatLocalDate(date, { day: "numeric", month: "short", year: "numeric" });

function ReceiptPage() {
  const navigate = useNavigate();
  const hydrated = useGym((s) => s.hydrated);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [unit, setUnit] = useState<WeightUnit>("kg");
  const [dragging, setDragging] = useState(false);
  const receiptRef = useRef<HTMLElement>(null);

  const result = useMemo(
    () => (file ? receiptFromExport(file.text, file.name, unit) : null),
    [file, unit],
  );
  const read = result?.ok ? result : null;
  // A header that says kg or lb wins; the switch only shows when the file does not say.
  const headerUnit = read?.analysis.detectedUnit;
  const shownUnit = headerUnit ?? unit;

  const open = async (picked: File | undefined) => {
    if (!picked) return;
    setFile({ name: picked.name, text: await picked.text() });
  };

  const continueInLockd = () => {
    if (!read || !file) return;
    const gym = useGym.getState();
    if (!gym.settings.onboardingCompletedAt) {
      gym.completeOnboarding({
        loadDemo: false,
        unitSystem: shownUnit === "lb" ? "imperial" : "metric",
      });
    }
    // The wizard's defaults: every session in the file that is not already in this browser's log.
    const selectedKeys = defaultSelection(sessionRows(read.analysis, storedFingerprints(useGym.getState())));
    useGym.getState().importPrepared({
      analysis: read.analysis,
      source: read.source,
      fileName: file.name,
      selectedKeys,
      allowDuplicates: false,
      nameOverrides: new Map(),
    });
    void navigate({ to: "/chronicle" });
  };

  return (
    <PaperShell>
      <h1 className="font-display text-4xl font-semibold tracking-tight">
        Your training life, on one receipt.
      </h1>
      <p className="mt-2 text-sm text-muted">
        Drop the export from Strong or Hevy. It is read here, on this device: the file is never
        uploaded, and you need no account.
      </p>

      <label
        className={cn(
          "mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center",
          dragging ? "border-accent bg-raised" : "border-current/20",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void open(event.dataTransfer.files[0]);
        }}
      >
        <span className="text-sm font-medium">
          {file ? file.name : "Drop your export here, or choose it"}
        </span>
        <span className="mt-1 text-xs text-subtle">A .csv file from Strong or Hevy</span>
        <input
          type="file"
          accept=".csv,text/csv"
          data-testid="receipt-file"
          className="sr-only"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = "";
            void open(picked);
          }}
        />
      </label>

      {result && !result.ok ? (
        <div role="alert" data-testid="receipt-problems" className="mt-4 rounded-xl bg-raised p-3 text-sm text-muted">
          {result.errors.map((line) => (
            <p key={line} className="mt-1 first:mt-0">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {read ? (
        <>
          <p className="mt-4 text-xs text-subtle" data-testid="receipt-source">
            Read as {read.source.label}.{" "}
            {headerUnit ? `Weights in ${headerUnit}, as the file’s header says.` : null}
          </p>
          {!headerUnit ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-subtle">
              <span>The file does not say kg or lb. Its weights are in</span>
              {(["kg", "lb"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setUnit(option)}
                  data-testid={`receipt-unit-${option}`}
                  aria-pressed={unit === option}
                  className={cn(
                    "h-9 rounded-full px-3 text-sm",
                    unit === option ? "bg-accent text-accent-ink" : "bg-raised hairline",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}

          <LifetimeReceiptView receipt={read.receipt} unit={shownUnit} innerRef={receiptRef} />

          <div className="mt-5 space-y-2">
            <Button
              className="w-full"
              size="lg"
              disabled={!hydrated}
              onClick={continueInLockd}
              data-testid="receipt-continue"
            >
              Continue in Lock’d
            </Button>
            <p className="text-center text-xs leading-relaxed text-subtle">
              Nothing is saved yet. Continuing keeps these sessions in this browser, with no
              account; sessions already here are recognised and left out.
            </p>
            <Button
              className="w-full"
              variant="secondary"
              onClick={() => {
                if (receiptRef.current) {
                  void downloadReceiptPng(receiptRef.current, "lockd-training-receipt.png");
                }
              }}
            >
              Save as image
            </Button>
          </div>
        </>
      ) : null}
    </PaperShell>
  );
}

function LifetimeReceiptView({
  receipt,
  unit,
  innerRef,
}: {
  receipt: LifetimeReceipt;
  unit: WeightUnit;
  innerRef: React.Ref<HTMLElement>;
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
            Estimates use the {FORMULA_LABEL[receipt.formula]} formula on your best set; warm-ups
            are left out.
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
