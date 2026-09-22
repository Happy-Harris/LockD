import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Page } from "@/components/app/shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { calculatePlates } from "@/domain/plateCalculator";
import { formatWeight, parseWeightInput, weightUnitFor } from "@/domain/units";
import { useGym } from "@/lib/gym/store";

export const Route = createFileRoute("/tools/plates")({ component: PlatesPage });

function PlatesPage() {
  const settings = useGym((s) => s.settings);
  const plates = useGym((s) => s.plates);
  const bars = useGym((s) => s.bars);
  const unit = weightUnitFor(settings.unitSystem);
  const inventory = plates.find((row) => row.id === settings.defaultPlateInventoryId) ?? plates[0];
  const bar = bars.find((row) => row.id === settings.defaultBarProfileId) ?? bars[0];
  const [raw, setRaw] = useState(unit === "kg" ? "100" : "225");

  const result = useMemo(() => {
    if (!inventory || !bar) return null;
    const grams = parseWeightInput(raw, unit) ?? 0;
    return calculatePlates({
      targetTotalG: grams,
      barWeightG: bar.weightG,
      collarWeightG: bar.collarWeightG,
      plates: inventory.plates,
    });
  }, [raw, unit, inventory, bar]);

  return (
    <Page>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Plates</h1>
      <p className="mt-1 text-sm text-muted">
        {bar?.name}. Inventory: {inventory?.name}. Loads in pairs.
      </p>
      <label className="mt-5 block">
        <span className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-subtle">Target ({unit})</span>
        <Input inputMode="decimal" value={raw} onChange={(event) => setRaw(event.target.value)} />
      </label>

      {result ? (
        <>
          <Card className="mt-5">
            <p className="text-xs uppercase tracking-[0.16em] text-subtle">{result.status.replaceAll("_", " ")}</p>
            <p className="mt-1 font-display text-3xl font-semibold tabular">
              {formatWeight(result.achievedTotalG, unit)} {unit}
            </p>
            <p className="mt-1 text-sm text-muted">{result.message}</p>
          </Card>
          <BarbellVisual perSide={result.perSide} unit={unit} />
          <ul className="mt-4 space-y-2">
            {result.perSide.map((item) => (
              <li key={item.weightG} className="flex justify-between rounded-xl bg-surface px-4 py-3 text-sm hairline">
                <span>{formatWeight(item.weightG, unit)} {unit}</span>
                <span className="tabular text-muted">{item.countPerSide} per side</span>
              </li>
            ))}
            {result.perSide.length === 0 ? (
              <li className="text-sm text-muted">Bare bar.</li>
            ) : null}
          </ul>
        </>
      ) : null}
    </Page>
  );
}

function BarbellVisual({
  perSide,
  unit,
}: {
  perSide: Array<{ weightG: number; countPerSide: number }>;
  unit: "kg" | "lb";
}) {
  const colors = ["#c24a32", "#8cbacc", "#6eb084", "#d7a04a", "#b8b0a2", "#7e776c", "#f6f1e8"];
  const plates: Array<{ label: string; h: number; color: string }> = [];
  perSide.forEach((item, index) => {
    const display = Number(formatWeight(item.weightG, unit));
    for (let i = 0; i < item.countPerSide; i += 1) {
      plates.push({
        label: formatWeight(item.weightG, unit),
        h: Math.max(48, Math.min(140, 28 + display * 2.2)),
        color: colors[index % colors.length]!,
      });
    }
  });
  return (
    <div className="mt-5 overflow-x-auto rounded-2xl bg-raised px-4 py-6 hairline">
      <div className="flex min-h-40 min-w-[280px] items-center justify-center gap-1">
        <div className="flex flex-row-reverse items-center gap-0.5">
          {plates.map((plate, index) => (
            <div
              key={`l-${index}`}
              className="flex items-center justify-center rounded-sm text-[9px] font-semibold"
              style={{
                width: 16,
                height: plate.h,
                background: plate.color,
                color: index === 0 ? "var(--rf-accent-ink)" : "#161412",
              }}
            >
              {plate.label}
            </div>
          ))}
        </div>
        <div className="h-3 w-24 rounded-full bg-ink/70" />
        <div className="flex items-center gap-0.5">
          {plates.map((plate, index) => (
            <div
              key={`r-${index}`}
              className="flex items-center justify-center rounded-sm text-[9px] font-semibold"
              style={{
                width: 16,
                height: plate.h,
                background: plate.color,
                color: index === 0 ? "var(--rf-accent-ink)" : "#161412",
              }}
            >
              {plate.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
