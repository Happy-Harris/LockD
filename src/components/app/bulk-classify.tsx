import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EQUIPMENT, MOVEMENT_PATTERNS, MUSCLE_GROUPS, titleCase } from "@/domain/taxonomy";
import type { Equipment, MovementPattern, MuscleGroup } from "@/domain/types";
import { suggestFor, type Classification } from "@/lib/import/classify";
import { useGym } from "@/lib/gym/store";

interface Draft {
  muscle?: MuscleGroup;
  equipment?: Equipment;
  pattern?: MovementPattern;
}

const selectClass =
  "h-11 w-full rounded-xl bg-raised px-3 text-sm text-ink hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70";

/**
 * Bulk Classify: the exercises an import left without a muscle group, listed so they can be filled
 * in together. A name-based suggestion is shown for each and is used only when the lifter taps it;
 * nothing is applied until "Apply". Only exercises that are still unmapped are touched, and past
 * sessions are filled in only where they recorded no muscle group.
 */
export function BulkClassify() {
  const exercises = useGym((s) => s.exercises);
  const classifyExercises = useGym((s) => s.classifyExercises);
  const rows = useMemo(() => suggestFor(exercises), [exercises]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted" data-testid="bulk-classify-empty">
        Every exercise has a muscle group.
      </p>
    );
  }

  const patch = (id: string, change: Draft) =>
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...change } }));

  const ready = rows.filter((row) => drafts[row.exercise.id]?.muscle);
  const suggestible = rows.filter((row) => row.suggestion);

  const fillFromSuggestion = (
    id: string,
    suggestion: NonNullable<(typeof rows)[number]["suggestion"]>,
  ) =>
    patch(id, {
      muscle: suggestion.primaryMuscleGroup,
      equipment: suggestion.equipment,
      pattern: suggestion.movementPattern,
    });

  const apply = () => {
    const items: Classification[] = ready.map((row) => {
      const draft = drafts[row.exercise.id]!;
      return {
        exerciseId: row.exercise.id,
        primaryMuscleGroup: draft.muscle!,
        equipment: draft.equipment ?? row.exercise.equipment,
        movementPattern: draft.pattern ?? row.exercise.movementPattern,
      };
    });
    const changed = classifyExercises(items);
    setDrafts({});
    toast.success(`Classified ${changed} exercise${changed === 1 ? "" : "s"}`);
  };

  return (
    <div data-testid="bulk-classify">
      <p className="text-sm text-muted">
        {rows.length} exercise{rows.length === 1 ? " has" : "s have"} no muscle group, so
        {rows.length === 1 ? " it is" : " they are"} left out of muscle analytics. Choose one for
        each. Suggestions come from the name only and are used only when you tap them.
      </p>
      {suggestible.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          data-testid="bulk-use-suggestions"
          onClick={() =>
            suggestible.forEach((row) => fillFromSuggestion(row.exercise.id, row.suggestion!))
          }
        >
          Fill in all {suggestible.length} suggestions to review
        </Button>
      ) : null}
      <ul className="mt-3 divide-y divide-line">
        {rows.map(({ exercise, suggestion }) => {
          const draft = drafts[exercise.id] ?? {};
          return (
            <li
              key={exercise.id}
              className="space-y-2 py-3"
              data-testid={`bulk-row-${exercise.name}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{exercise.name}</p>
                {suggestion ? (
                  <button
                    type="button"
                    className="shrink-0 text-xs text-accent underline-offset-2 hover:underline"
                    onClick={() => fillFromSuggestion(exercise.id, suggestion)}
                  >
                    Suggested: {titleCase(suggestion.primaryMuscleGroup)} ·{" "}
                    {titleCase(suggestion.equipment)}
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-subtle">No suggestion</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select
                  aria-label={`Muscle group for ${exercise.name}`}
                  className={selectClass}
                  value={draft.muscle ?? ""}
                  onChange={(event) =>
                    patch(exercise.id, {
                      muscle: (event.target.value || undefined) as MuscleGroup | undefined,
                    })
                  }
                >
                  <option value="">Muscle…</option>
                  {MUSCLE_GROUPS.map((group) => (
                    <option key={group} value={group}>
                      {titleCase(group)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Equipment for ${exercise.name}`}
                  className={selectClass}
                  value={draft.equipment ?? exercise.equipment}
                  onChange={(event) =>
                    patch(exercise.id, { equipment: event.target.value as Equipment })
                  }
                >
                  {EQUIPMENT.map((item) => (
                    <option key={item} value={item}>
                      {titleCase(item)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Movement pattern for ${exercise.name}`}
                  className={selectClass}
                  value={draft.pattern ?? exercise.movementPattern}
                  onChange={(event) =>
                    patch(exercise.id, { pattern: event.target.value as MovementPattern })
                  }
                >
                  {MOVEMENT_PATTERNS.map((item) => (
                    <option key={item} value={item}>
                      {titleCase(item)}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        className="mt-3 w-full"
        disabled={ready.length === 0}
        data-testid="bulk-apply"
        onClick={apply}
      >
        Apply to {ready.length} exercise{ready.length === 1 ? "" : "s"}
      </Button>
    </div>
  );
}
