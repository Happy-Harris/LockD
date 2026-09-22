import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Page } from "@/components/app/shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { generateWarmup } from "@/domain/warmup";
import { formatWeight, parseWeightInput, weightUnitFor } from "@/domain/units";
import { useGym } from "@/lib/gym/store";

export const Route = createFileRoute("/tools/warmup")({ component: WarmupPage });

function WarmupPage() {
  const settings = useGym((s) => s.settings);
  const plates = useGym((s) => s.plates);
  const bars = useGym((s) => s.bars);
  const unit = weightUnitFor(settings.unitSystem);
  const inventory = plates.find((row) => row.id === settings.defaultPlateInventoryId) ?? plates[0];
  const bar = bars.find((row) => row.id === settings.defaultBarProfileId) ?? bars[0];
  const [raw, setRaw] = useState(unit === "kg" ? "100" : "225");
  const [count, setCount] = useState<3 | 4 | 5>(4);

  const steps = useMemo(() => {
    if (!inventory || !bar) return [];
    const grams = parseWeightInput(raw, unit) ?? 0;
    return generateWarmup({
      kind: "barbell",
      workingWeightG: grams,
      barWeightG: bar.weightG,
      collarWeightG: bar.collarWeightG,
      plates: inventory.plates,
      setCount: count,
    });
  }, [raw, unit, inventory, bar, count]);

  return (
    <Page>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Warm-up</h1>
      <p className="mt-1 text-sm text-muted">
        Convenience for loading the bar — not coaching advice. Ramps never exceed the working set.
      </p>
      <label className="mt-5 block">
        <span className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-subtle">Working weight ({unit})</span>
        <Input inputMode="decimal" value={raw} onChange={(event) => setRaw(event.target.value)} />
      </label>
      <div className="mt-3 flex gap-2">
        {([3, 4, 5] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setCount(value)}
            className={
              count === value
                ? "h-11 flex-1 rounded-xl bg-accent text-sm text-accent-ink"
                : "h-11 flex-1 rounded-xl bg-raised text-sm"
            }
          >
            {value} sets
          </button>
        ))}
      </div>
      <ol className="mt-5 space-y-2">
        {steps.map((step, index) => (
          <li key={`${step.weightG}-${index}`}>
            <Card className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {step.isBar ? "Empty bar" : `${Math.round(step.percent * 100)}%`}
                </p>
                <p className="text-xs text-muted">{step.reps} reps</p>
              </div>
              <p className="font-display text-2xl font-semibold tabular">
                {formatWeight(step.weightG, unit)} {unit}
              </p>
            </Card>
          </li>
        ))}
      </ol>
    </Page>
  );
}
