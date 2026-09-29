import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Page } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Stat } from "@/components/ui/card";
import { elapsedSeconds, formatLocalDate } from "@/domain/time";
import { formatDuration, formatWeightWithUnit, weightUnitFor } from "@/domain/units";
import { detectPrsForWorkout, workoutTonnageG } from "@/lib/gym/analytics";
import { workoutDiff } from "@/lib/gym/ghost";
import { sessionReplay } from "@/lib/gym/replay";
import { useSlices } from "@/lib/gym/hooks";
import { useGym } from "@/lib/gym/store";
import { completedSetCount } from "@/domain/volume";

export const Route = createFileRoute("/history_/$id")({ component: HistoryDetailPage });

function HistoryDetailPage() {
  const { id } = Route.useParams();
  const slices = useSlices();
  const settings = useGym((s) => s.settings);
  const startFromTemplate = useGym((s) => s.startFromTemplate);
  const startBeatWorkout = useGym((s) => s.startBeatWorkout);
  const clips = useGym((s) => s.clips);
  const navigate = useNavigate();
  const slice = slices.find((row) => row.workout.id === id);
  const unit = weightUnitFor(settings.unitSystem);

  if (!slice) {
    return (
      <Page>
        <p className="text-sm text-muted">Session not found.</p>
      </Page>
    );
  }

  const prs = detectPrsForWorkout(id, slices, settings.oneRepMaxFormula);
  const diff = workoutDiff(slice, slices, unit);
  const replay = sessionReplay(
    slice,
    prs.map((row) => row.exerciseId),
  );
  const sessionClips = clips.filter((row) => row.workoutId === id);

  return (
    <Page>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
        {formatLocalDate(slice.workout.localDate)}
      </p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">{slice.workout.name}</h1>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <Card className="p-3">
          <Stat
            label="Time"
            value={formatDuration(
              elapsedSeconds(slice.workout.startedAt, slice.workout.endedAt, slice.workout.pausedSeconds),
            )}
          />
        </Card>
        <Card className="p-3">
          <Stat label="Sets" value={completedSetCount(slice.sets)} />
        </Card>
        <Card className="p-3">
          <Stat label="Tonnage" value={formatWeightWithUnit(workoutTonnageG(slice, true), unit)} />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          onClick={() => {
            const started = startBeatWorkout(id);
            if (started) void navigate({ to: "/workout" });
          }}
        >
          Beat this
        </Button>
        {slice.workout.templateId ? (
          <Button
            variant="secondary"
            onClick={() => {
              startFromTemplate(slice.workout.templateId!);
              void navigate({ to: "/workout" });
            }}
          >
            Repeat routine
          </Button>
        ) : (
          <Button variant="secondary" asChild>
            <Link to="/history">History</Link>
          </Button>
        )}
      </div>

      {diff.lines.length > 0 ? (
        <Card className="mt-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Diff vs last comparable</p>
          <p className="mt-2 font-display text-xl font-semibold tracking-tight">{diff.headline}</p>
          <ul className="mt-3 space-y-2">
            {diff.lines.map((line) => (
              <li key={line.exerciseId} className="flex items-start justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">{line.exerciseName}</span>
                  <span className="mt-0.5 block text-xs text-muted">{line.summary}</span>
                </span>
                <Badge tone={line.verdict === "beat" ? "success" : line.verdict === "behind" ? "warning" : "muted"}>
                  {line.verdict}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mt-5 space-y-3">
        {slice.exercises.map((exercise) => {
          const sets = slice.sets
            .filter((set) => set.workoutExerciseId === exercise.id)
            .sort((a, b) => a.order - b.order);
          return (
            <Card key={exercise.id}>
              <Link to="/library/$id" params={{ id: exercise.exerciseId }} className="text-sm font-medium">
                {exercise.exerciseNameSnapshot}
              </Link>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {sets.map((set, index) => (
                  <li key={set.id} className="tabular">
                    {index + 1}.{" "}
                    {set.weightG
                      ? `${formatWeightWithUnit(set.weightG, unit)} × ${set.reps ?? "—"}`
                      : `${set.reps ?? "—"} reps`}
                    {set.setType !== "working" ? ` · ${set.setType}` : ""}
                    {set.grind ? ` · ${set.grind}` : ""}
                    {set.clipId ? " · clip" : ""}
                    {!set.isCompleted ? " · incomplete" : ""}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      {replay.length > 1 ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Session replay</h2>
          <ol className="mt-3 space-y-2">
            {replay.map((event, index) => (
              <li key={`${event.at}-${index}`} className="flex gap-3 text-sm">
                <span className="w-12 shrink-0 font-mono text-xs tabular text-subtle">{formatDuration(event.offsetSeconds)}</span>
                <span>
                  <span className="font-medium">{event.label}</span>
                  {event.detail ? <span className="mt-0.5 block text-xs text-muted">{event.detail}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {sessionClips.length > 0 ? (
        <Button className="mt-6 w-full" variant="secondary" asChild>
          <Link to="/vault">Open vault ({sessionClips.length})</Link>
        </Button>
      ) : null}
    </Page>
  );
}
