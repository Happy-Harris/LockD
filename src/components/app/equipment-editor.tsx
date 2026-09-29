import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { FieldLabel, Input } from "@/components/ui/input";
import { formatWeightInput, parseWeightInput, toGrams, weightUnitFor } from "@/domain/units";
import type { BarProfile } from "@/domain/types";
import { usablePairs } from "@/lib/gym/equipment";
import { useGym } from "@/lib/gym/store";
import { cn } from "@/lib/utils";

/**
 * The lifter's real gym: which bar, how heavy it and its collars are, and how many plates of each
 * weight they own. Plate-aware rounding and the plate calculator use exactly what is entered here.
 */
export function EquipmentEditor() {
  const settings = useGym((s) => s.settings);
  const bars = useGym((s) => s.bars);
  const plates = useGym((s) => s.plates);
  const updateSettings = useGym((s) => s.updateSettings);
  const updateBar = useGym((s) => s.updateBar);
  const addBar = useGym((s) => s.addBar);
  const setPlateCount = useGym((s) => s.setPlateCount);
  const unit = weightUnitFor(settings.unitSystem);
  const bar = bars.find((row) => row.id === settings.defaultBarProfileId) ?? bars[0];
  const inventory = plates.find((row) => row.id === settings.defaultPlateInventoryId) ?? plates[0];
  const [newPlate, setNewPlate] = useState("");

  return (
    <div className="space-y-5">
      <div>
        <FieldLabel htmlFor="equipment-bar">Bar</FieldLabel>
        <select
          id="equipment-bar"
          className="h-11 w-full rounded-xl bg-raised px-3 text-ink hairline"
          value={bar?.id ?? ""}
          onChange={(event) => updateSettings({ defaultBarProfileId: event.target.value })}
        >
          {bars.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="mt-2 h-11 rounded-xl bg-raised px-3 text-sm"
          onClick={() => {
            const id = addBar({ name: "My bar", weightG: toGrams(unit === "kg" ? 20 : 45, unit) });
            updateSettings({ defaultBarProfileId: id });
          }}
        >
          Add a bar
        </button>
        {bar ? (
          <BarFields
            key={bar.id}
            bar={bar}
            unit={unit}
            onChange={(patch) => updateBar(bar.id, patch)}
          />
        ) : null}
      </div>

      {inventory ? (
        <div>
          <FieldLabel htmlFor="equipment-plates">Plates you own ({inventory.name})</FieldLabel>
          {plates.length > 1 ? (
            <select
              id="equipment-plates"
              className="mb-3 h-11 w-full rounded-xl bg-raised px-3 text-ink hairline"
              value={inventory.id}
              onChange={(event) => updateSettings({ defaultPlateInventoryId: event.target.value })}
            >
              {plates.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          ) : null}
          <ul className="space-y-2">
            {inventory.plates.map((plate) => (
              <li key={plate.weightG} className="flex items-center gap-2">
                <span className="w-20 font-mono text-sm tabular">
                  {formatWeightInput(plate.weightG, inventory.unit)} {inventory.unit}
                </span>
                <button
                  type="button"
                  aria-label={`Fewer ${formatWeightInput(plate.weightG, inventory.unit)} ${inventory.unit} plates`}
                  className="grid size-11 place-items-center rounded-xl bg-raised"
                  onClick={() => setPlateCount(inventory.id, plate.weightG, plate.count - 2)}
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-8 text-center font-mono tabular">{plate.count}</span>
                <button
                  type="button"
                  aria-label={`More ${formatWeightInput(plate.weightG, inventory.unit)} ${inventory.unit} plates`}
                  className="grid size-11 place-items-center rounded-xl bg-raised"
                  onClick={() => setPlateCount(inventory.id, plate.weightG, plate.count + 2)}
                >
                  <Plus className="size-4" />
                </button>
                <span className={cn("text-xs text-subtle", plate.count % 2 === 1 && "text-accent")}>
                  {plate.count % 2 === 1
                    ? "odd plate is never loaded"
                    : `${usablePairs(plate)} per side`}
                </span>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const grams = parseWeightInput(newPlate, inventory.unit);
              if (!grams || grams <= 0) return;
              setPlateCount(inventory.id, grams, 2);
              setNewPlate("");
            }}
          >
            <Input
              inputMode="decimal"
              value={newPlate}
              onChange={(event) => setNewPlate(event.target.value)}
              placeholder={`Add a plate (${inventory.unit})`}
              aria-label="New plate weight"
            />
            <button type="submit" className="h-11 shrink-0 rounded-xl bg-raised px-4 text-sm">
              Add pair
            </button>
          </form>
          <p className="mt-2 text-xs text-subtle">
            Counts are plates you own, so 4 means two per side. Set a count to 0 to remove a weight.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function BarFields({
  bar,
  unit,
  onChange,
}: {
  bar: BarProfile;
  unit: "kg" | "lb";
  onChange: (patch: Partial<Pick<BarProfile, "name" | "weightG" | "collarWeightG">>) => void;
}) {
  const [weight, setWeight] = useState(formatWeightInput(bar.weightG, unit));
  const [collars, setCollars] = useState(formatWeightInput(bar.collarWeightG, unit));
  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <FieldLabel htmlFor="bar-name">Name</FieldLabel>
        <Input
          id="bar-name"
          value={bar.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </div>
      <div>
        <FieldLabel htmlFor="bar-weight">Bar ({unit})</FieldLabel>
        <Input
          id="bar-weight"
          inputMode="decimal"
          value={weight}
          onChange={(event) => {
            setWeight(event.target.value);
            const grams = parseWeightInput(event.target.value, unit);
            if (grams && grams > 0) onChange({ weightG: grams });
          }}
        />
      </div>
      <div>
        <FieldLabel htmlFor="bar-collars">Collars, pair ({unit})</FieldLabel>
        <Input
          id="bar-collars"
          inputMode="decimal"
          value={collars}
          onChange={(event) => {
            setCollars(event.target.value);
            const grams =
              event.target.value.trim() === "" ? 0 : parseWeightInput(event.target.value, unit);
            if (grams != null && grams >= 0) onChange({ collarWeightG: grams });
          }}
        />
      </div>
    </div>
  );
}
