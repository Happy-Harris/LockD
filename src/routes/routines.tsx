import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Play, Plus } from "lucide-react";
import { useMemo } from "react";
import { Page } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { uuid } from "@/domain/ids";
import { STARTER_TEMPLATES, buildStarterTemplate } from "@/lib/gym/seed";
import { useGym } from "@/lib/gym/store";

export const Route = createFileRoute("/routines")({ component: RoutinesPage });

function RoutinesPage() {
  const navigate = useNavigate();
  // Select the stored array and filter in a memo: a selector that returns a new array on
  // every call makes useSyncExternalStore loop forever ("Maximum update depth exceeded").
  const allTemplates = useGym((s) => s.templates);
  const templates = useMemo(() => allTemplates.filter((row) => !row.isArchived), [allTemplates]);
  const templateExercises = useGym((s) => s.templateExercises);
  const startFromTemplate = useGym((s) => s.startFromTemplate);
  const upsertTemplate = useGym((s) => s.upsertTemplate);

  const createBlank = () => {
    const stamp = new Date().toISOString();
    const template = {
      id: uuid(),
      name: "New routine",
      order: templates.length,
      isArchived: false,
      createdAt: stamp,
      updatedAt: stamp,
    };
    upsertTemplate(template, []);
    void navigate({ to: "/routines/$id", params: { id: template.id } });
  };

  return (
    <Page>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">Train</h1>
          <p className="mt-1 text-sm text-muted">Routines for today. Programs for the block.</p>
        </div>
        <Button size="icon" onClick={createBlank} aria-label="New routine">
          <Plus className="size-5" />
        </Button>
      </div>

      <div className="space-y-2">
        {templates.map((template) => {
          const count = templateExercises.filter((row) => row.templateId === template.id).length;
          return (
            <Card key={template.id} className="flex items-center gap-3 p-3">
              <Link to="/routines/$id" params={{ id: template.id }} className="min-w-0 flex-1">
                <p className="font-medium text-ink">{template.name}</p>
                <p className="text-xs text-muted">{count} exercises</p>
              </Link>
              <Button
                size="icon"
                variant="secondary"
                aria-label={`Start ${template.name}`}
                onClick={() => {
                  startFromTemplate(template.id);
                  void navigate({ to: "/workout" });
                }}
              >
                <Play className="size-4" />
              </Button>
            </Card>
          );
        })}
      </div>

      {templates.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No routines yet. Add a starter below.</p>
      ) : null}

      <Link to="/programs" className="mt-8 block">
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Programs</p>
          <p className="mt-1 font-display text-2xl font-semibold tracking-tight">Multi-week blocks</p>
          <p className="mt-1 text-sm text-muted">Progression rules, deload weeks, substitutions, local files.</p>
        </Card>
      </Link>

      <h2 className="mt-8 font-display text-2xl font-semibold tracking-tight">Starter presets</h2>
      <p className="mt-1 text-sm text-muted">Tap to copy into your list. Editable afterwards.</p>
      <div className="mt-3 space-y-2">
        {STARTER_TEMPLATES.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="w-full rounded-2xl bg-surface p-4 text-left hairline"
            onClick={() => {
              const built = buildStarterTemplate(preset, templates.length);
              upsertTemplate(built.template, built.exercises);
            }}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">{preset.category}</p>
            <p className="mt-1 font-medium">{preset.name}</p>
            <p className="mt-1 text-sm text-muted">{preset.description}</p>
          </button>
        ))}
      </div>
    </Page>
  );
}
