import { Check, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { MAX_GOAL_LIFTS, rankedGoalLiftCandidates } from "@/domain/analytics/weeklyVerdict";
import type { TrainingBaselineWeek } from "@/domain/analytics/trainingWeeks";
import type { Exercise, UUID } from "@/domain/types";
import { cn } from "@/lib/utils";

/**
 * Lets the lifter name up to three goal lifts, instead of the app guessing them. With none picked
 * the verdict falls back to the most-trained lifts and says it is a guess. Rows show how many
 * sessions each lift has in the baseline when a baseline is available.
 */
export function GoalLiftPicker({
  open,
  onClose,
  exercises,
  goalLiftIds,
  onChange,
  baselineWeeks,
}: {
  open: boolean;
  onClose: () => void;
  exercises: readonly Exercise[];
  goalLiftIds: readonly UUID[] | undefined;
  onChange: (ids: UUID[]) => void;
  baselineWeeks?: readonly TrainingBaselineWeek[];
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UUID[]>(() => [...(goalLiftIds ?? [])]);

  useEffect(() => {
    if (!open) return;
    // Start from what is saved each time the sheet opens, not on every change while it is open.
    setSelected([...(goalLiftIds ?? [])]);
    setSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sessionsByLift = useMemo(
    () =>
      new Map(
        rankedGoalLiftCandidates(baselineWeeks ?? []).map((lift) => [lift.id, lift.sessions]),
      ),
    [baselineWeeks],
  );

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return exercises
      .filter((exercise) => !exercise.isArchived)
      .filter((exercise) => (query ? exercise.name.toLowerCase().includes(query) : true))
      .map((exercise) => ({ exercise, sessions: sessionsByLift.get(exercise.id) ?? 0 }))
      .sort((a, b) => b.sessions - a.sessions || a.exercise.name.localeCompare(b.exercise.name));
  }, [exercises, search, sessionsByLift]);

  const toggle = (id: UUID) =>
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= MAX_GOAL_LIFTS) return current;
      return [...current, id];
    });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Goal lifts"
      description={`Pick up to ${MAX_GOAL_LIFTS}. Pick none and Lock’d uses your most-trained lifts, labelled as a guess.`}
      size="lg"
    >
      <div data-testid="goal-lift-picker">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search your library"
          aria-label="Search exercises"
        />
        <p className="mt-2 text-xs text-subtle" aria-live="polite">
          {selected.length} of {MAX_GOAL_LIFTS} chosen
        </p>

        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No matching exercises.</p>
        ) : null}

        <ul className="mt-2 max-h-[46vh] space-y-1.5 overflow-y-auto">
          {rows.map(({ exercise, sessions }) => {
            const isSelected = selected.includes(exercise.id);
            const atCap = !isSelected && selected.length >= MAX_GOAL_LIFTS;
            return (
              <li key={exercise.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  disabled={atCap}
                  onClick={() => toggle(exercise.id)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                    isSelected ? "bg-accent/15 ring-1 ring-accent" : "bg-raised hover:bg-raised/70",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                      isSelected ? "bg-accent text-accent-ink" : "bg-surface text-subtle",
                    )}
                  >
                    {isSelected ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {exercise.name}
                    </span>
                    {sessions > 0 ? (
                      <span className="block text-xs text-subtle">
                        {sessions} session{sessions === 1 ? "" : "s"} in your baseline
                      </span>
                    ) : null}
                  </span>
                  {exercise.isCustom ? <Badge tone="accent">Custom</Badge> : null}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              onChange([]);
              onClose();
            }}
          >
            Use my top lifts instead
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onChange(selected);
              onClose();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
