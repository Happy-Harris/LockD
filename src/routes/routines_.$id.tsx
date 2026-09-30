import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ExercisePicker } from "@/components/app/exercise-picker";
import { Page } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uuid } from "@/domain/ids";
import { useGym } from "@/lib/gym/store";

export const Route = createFileRoute("/routines_/$id")({ component: RoutineEditorPage });

function RoutineEditorPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const templates = useGym((s) => s.templates);
  const templateExercises = useGym((s) => s.templateExercises);
  const exercises = useGym((s) => s.exercises);
  const upsertTemplate = useGym((s) => s.upsertTemplate);
  const deleteTemplate = useGym((s) => s.deleteTemplate);
  const startFromTemplate = useGym((s) => s.startFromTemplate);
  const template = templates.find((row) => row.id === id);
  const [picker, setPicker] = useState(false);

  const rows = useMemo(
    () =>
      templateExercises
        .filter((row) => row.templateId === id)
        .sort((a, b) => a.order - b.order),
    [templateExercises, id],
  );

  if (!template) {
    return (
      <Page>
        <p className="text-sm text-muted">Routine not found.</p>
      </Page>
    );
  }

  const saveRows = (next: typeof rows, name = template.name) => {
    upsertTemplate(
      { ...template, name, updatedAt: new Date().toISOString() },
      next.map((row, index) => ({ ...row, order: index })),
    );
  };

  return (
    <Page>
      <Input
        value={template.name}
        onChange={(event) => saveRows(rows, event.target.value)}
        className="mb-4 h-14 font-display text-2xl font-semibold"
      />
      <div className="space-y-3">
        {rows.map((row) => {
          const exercise = exercises.find((item) => item.id === row.exerciseId);
          return (
            <div key={row.id} className="rounded-2xl bg-surface p-3 hairline">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{exercise?.name ?? "Missing exercise"}</p>
                  <p className="text-xs text-muted">{exercise ? exercise.primaryMuscleGroup : ""}</p>
                </div>
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-xl text-subtle hover:bg-raised"
                  onClick={() => saveRows(rows.filter((item) => item.id !== row.id))}
                  aria-label="Remove"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Labeled number value={row.targetSets} label="Sets" onChange={(value) => saveRows(rows.map((item) => (item.id === row.id ? { ...item, targetSets: value } : item)))} />
                <Labeled number value={row.targetRepMin ?? 8} label="Rep min" onChange={(value) => saveRows(rows.map((item) => (item.id === row.id ? { ...item, targetRepMin: value } : item)))} />
                <Labeled number value={row.targetRepMax ?? 12} label="Rep max" onChange={(value) => saveRows(rows.map((item) => (item.id === row.id ? { ...item, targetRepMax: value } : item)))} />
              </div>
              <div className="mt-2">
                <Labeled
                  number
                  value={row.restSeconds}
                  label="Rest (sec)"
                  onChange={(value) =>
                    saveRows(rows.map((item) => (item.id === row.id ? { ...item, restSeconds: value } : item)))
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
      <Button variant="secondary" className="mt-4 w-full" onClick={() => setPicker(true)}>
        <Plus className="size-4" />
        Add exercise
      </Button>
      <div className="mt-6 flex gap-2">
        <Button
          className="flex-1"
          onClick={() => {
            startFromTemplate(template.id);
            void navigate({ to: "/workout" });
          }}
        >
          Start
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            deleteTemplate(template.id);
            void navigate({ to: "/routines" });
          }}
        >
          Delete
        </Button>
      </div>
      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(exercise) => {
          saveRows([
            ...rows,
            {
              id: uuid(),
              templateId: template.id,
              exerciseId: exercise.id,
              order: rows.length,
              targetSets: 3,
              targetRepMin: 8,
              targetRepMax: 12,
              restSeconds: 90,
              defaultSetType: "working",
              includeWarmup: false,
            },
          ]);
        }}
      />
    </Page>
  );
}

function Labeled({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  number?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-micro uppercase tracking-[0.14em] text-subtle">{label}</span>
      <Input
        inputMode="numeric"
        value={String(value)}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </label>
  );
}
