import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Equipment, Exercise, MuscleGroup } from "@/domain/types";
import { EQUIPMENT, MUSCLE_GROUPS, titleCase } from "@/domain/taxonomy";
import { useGym } from "@/lib/gym/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ExercisePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
}) {
  const exercises = useGym((s) => s.exercises);
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | "all">("all");
  const [equip, setEquip] = useState<Equipment | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises
      .filter((exercise) => !exercise.isArchived)
      .filter((exercise) => (muscle === "all" ? true : exercise.primaryMuscleGroup === muscle))
      .filter((exercise) => (equip === "all" ? true : exercise.equipment === equip))
      .filter((exercise) => (q ? exercise.name.toLowerCase().includes(q) : true))
      .slice(0, 80);
  }, [exercises, query, muscle, equip]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-canvas/70 p-0 sm:items-center sm:p-6">
      <div className="flex h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl bg-surface sm:h-[min(720px,88dvh)] sm:rounded-3xl hairline">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Add exercise</h2>
          <button type="button" className="grid size-11 place-items-center rounded-xl hover:bg-raised" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <div className="px-4 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the library"
              className="pl-10"
            />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <Chip active={muscle === "all"} onClick={() => setMuscle("all")}>
              All
            </Chip>
            {MUSCLE_GROUPS.slice(0, 12).map((group) => (
              <Chip key={group} active={muscle === group} onClick={() => setMuscle(group)}>
                {titleCase(group)}
              </Chip>
            ))}
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            <Chip active={equip === "all"} onClick={() => setEquip("all")}>
              Any kit
            </Chip>
            {EQUIPMENT.slice(0, 8).map((item) => (
              <Chip key={item} active={equip === item} onClick={() => setEquip(item)}>
                {titleCase(item)}
              </Chip>
            ))}
          </div>
        </div>
        <ul className="mt-2 flex-1 overflow-y-auto px-2 pb-4">
          {filtered.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left hover:bg-raised"
                onClick={() => {
                  onPick(exercise);
                  onClose();
                }}
              >
                <span>
                  <span className="block text-sm font-medium text-ink">{exercise.name}</span>
                  <span className="block text-xs text-muted">
                    {titleCase(exercise.primaryMuscleGroup)} · {titleCase(exercise.equipment)}
                  </span>
                </span>
                <Button size="sm" variant="secondary" tabIndex={-1}>
                  Add
                </Button>
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="px-3 py-10 text-center text-sm text-muted">No exercises match that filter.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 shrink-0 rounded-full px-3 text-xs font-medium",
        active ? "bg-accent text-accent-ink" : "bg-raised text-muted",
      )}
    >
      {children}
    </button>
  );
}
