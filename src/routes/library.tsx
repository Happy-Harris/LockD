import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BulkClassify } from "@/components/app/bulk-classify";
import { Page } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MUSCLE_GROUPS, titleCase } from "@/domain/taxonomy";
import type { MuscleGroup } from "@/domain/types";
import { unmappedExercises } from "@/lib/import/classify";
import { useGym } from "@/lib/gym/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/library")({ component: LibraryPage });

function LibraryPage() {
  const exercises = useGym((s) => s.exercises);
  const addCustomExercise = useGym((s) => s.addCustomExercise);
  const unmapped = useMemo(() => unmappedExercises(exercises).length, [exercises]);
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | "all">("all");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises
      .filter((exercise) => !exercise.isArchived)
      .filter((exercise) => (muscle === "all" ? true : exercise.primaryMuscleGroup === muscle))
      .filter((exercise) => (q ? exercise.name.toLowerCase().includes(q) : true));
  }, [exercises, query, muscle]);

  return (
    <Page>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Library</h1>
      <p className="mt-1 text-sm text-muted">
        {exercises.length} lifts. Custom ones stay on this device.
      </p>
      {unmapped > 0 ? (
        <details className="mt-3 rounded-xl bg-raised p-3" data-testid="library-unmapped">
          <summary className="cursor-pointer text-sm">
            {unmapped} exercise{unmapped === 1 ? " needs" : "s need"} a muscle group
          </summary>
          <div className="mt-3">
            <BulkClassify />
          </div>
        </details>
      ) : null}
      <Input
        className="mt-4"
        placeholder="Search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setMuscle("all")}
          className={cn(
            "h-9 shrink-0 rounded-full px-3 text-xs",
            muscle === "all" ? "bg-accent text-accent-ink" : "bg-raised text-muted",
          )}
        >
          All
        </button>
        {MUSCLE_GROUPS.map((group) => (
          <button
            key={group}
            type="button"
            onClick={() => setMuscle(group)}
            className={cn(
              "h-9 shrink-0 rounded-full px-3 text-xs",
              muscle === group ? "bg-accent text-accent-ink" : "bg-raised text-muted",
            )}
          >
            {titleCase(group)}
          </button>
        ))}
      </div>
      <ul className="mt-4 divide-y divide-line">
        {filtered.map((exercise) => (
          <li key={exercise.id}>
            <Link
              to="/library/$id"
              params={{ id: exercise.id }}
              className="flex min-h-14 items-center justify-between"
            >
              <span>
                <span className="block text-sm font-medium">{exercise.name}</span>
                <span className="block text-xs text-muted">
                  {titleCase(exercise.primaryMuscleGroup)} · {titleCase(exercise.equipment)}
                  {exercise.isCustom ? " · custom" : ""}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {creating ? (
        <form
          className="mt-4 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            addCustomExercise({
              name: name.trim(),
              primaryMuscleGroup: "unmapped",
              secondaryMuscleGroups: [],
              equipment: "other",
              movementPattern: "isolation",
              trackingType: "weight_reps",
            });
            setName("");
            setCreating(false);
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Custom exercise name"
          />
          <Button type="submit" className="w-full">
            Save
          </Button>
        </form>
      ) : (
        <Button variant="secondary" className="mt-4 w-full" onClick={() => setCreating(true)}>
          New custom exercise
        </Button>
      )}
    </Page>
  );
}
