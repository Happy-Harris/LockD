import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useStartProgramSession } from "@/lib/gym/program-hooks";
import { Play } from "lucide-react";
import { useState } from "react";
import { ExercisePicker } from "@/components/app/exercise-picker";
import { Page } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useGymDerived } from "@/lib/gym/hooks";
import { useGym } from "@/lib/gym/store";
import { PublishButton } from "@/components/app/publish-button";
import { programShare } from "@/lib/cloud/shares";
import { resolveProgramExercise, unresolvedProgramRows } from "@/lib/gym/programs";

export const Route = createFileRoute("/programs_/$id")({ component: ProgramDetailPage });

function ProgramDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { programs, programWeeks, programSessions, programExercises, exercises } = useGymDerived();
  const startFromProgramSession = useStartProgramSession();
  const setActiveProgram = useGym((s) => s.setActiveProgram);
  const restartProgram = useGym((s) => s.restartProgram);
  const duplicateProgram = useGym((s) => s.duplicateProgram);
  const deleteProgram = useGym((s) => s.deleteProgram);
  const exportProgram = useGym((s) => s.exportProgram);
  const substituteProgramExercise = useGym((s) => s.substituteProgramExercise);
  const program = programs.find((row) => row.id === id);
  const [swapId, setSwapId] = useState<string | null>(null);

  if (!program) {
    return (
      <Page>
        <p className="text-sm text-muted">Program not found.</p>
      </Page>
    );
  }

  const weeks = programWeeks.filter((row) => row.programId === id).sort((a, b) => a.weekNumber - b.weekNumber);
  const sessions = programSessions.filter((row) => row.programId === id).sort((a, b) => a.order - b.order);
  const sessionIds = new Set(sessions.map((row) => row.id));
  const unresolved = unresolvedProgramRows(
    programExercises.filter((row) => sessionIds.has(row.programSessionId)),
    exercises,
  );

  const download = () => {
    const file = exportProgram(id);
    if (!file) return;
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${program.name.replace(/\s+/g, "-").toLowerCase()}.lockd-program.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Page>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">{program.lens}</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">{program.name}</h1>
      <p className="mt-2 text-sm text-muted">{program.notes}</p>
      <p className="mt-2 text-sm text-muted">
        {program.completedAt
          ? `Program complete · all ${program.weekCount} weeks finished on ${program.completedAt.slice(0, 10)}`
          : `Week ${program.currentWeek} of ${program.weekCount}`}
        {program.isActive ? " · active" : ""}
      </p>

      {unresolved.length > 0 ? (
        <Card className="mt-4" data-testid="unresolved-notice">
          <p className="text-sm font-medium">Not in your library</p>
          <p className="mt-1 text-sm text-muted">
            {[...new Set(unresolved.map((row) => row.name))].join(", ")}. These stay in the program and are
            skipped when you start a session. Add an exercise with the same name, or swap it below.
          </p>
        </Card>
      ) : null}

      {program.completedAt ? (
        <Button className="mt-4 w-full" data-testid="restart-program" onClick={() => restartProgram(id)}>
          Restart from week 1
        </Button>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button
          onClick={() => {
            startFromProgramSession(id);
            void navigate({ to: "/workout" });
          }}
        >
          <Play className="size-4" />
          Start next
        </Button>
        <Button variant="secondary" onClick={() => setActiveProgram(id)}>
          Make active
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            const copy = duplicateProgram(id);
            if (copy) void navigate({ to: "/programs/$id", params: { id: copy } });
          }}
        >
          Duplicate block
        </Button>
        <Button variant="secondary" onClick={download}>
          Export file
        </Button>
      </div>
      {(() => {
        const file = exportProgram(id);
        return file ? (
          <div className="mt-3">
            <PublishButton kind="program" title={program.name} payload={programShare(file)} label="Publish program link" />
          </div>
        ) : null;
      })()}

      <h2 className="mt-8 font-display text-2xl font-semibold tracking-tight">Weeks</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {weeks.map((week) => (
          <span
            key={week.id}
            className={
              week.weekNumber === program.currentWeek
                ? "rounded-full bg-accent px-3 py-2 text-xs text-accent-ink"
                : "rounded-full bg-raised px-3 py-2 text-xs hairline"
            }
          >
            W{week.weekNumber}
            {week.isDeload ? " deload" : ""}
          </span>
        ))}
      </div>

      <h2 className="mt-8 font-display text-2xl font-semibold tracking-tight">Sessions</h2>
      <div className="mt-3 space-y-3">
        {sessions.map((session) => {
          const lifts = programExercises
            .filter((row) => row.programSessionId === session.id)
            .sort((a, b) => a.order - b.order);
          return (
            <Card key={session.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{session.name}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    startFromProgramSession(id, session.id);
                    void navigate({ to: "/workout" });
                  }}
                >
                  Start
                </Button>
              </div>
              <ul className="mt-3 space-y-2">
                {lifts.map((lift) => (
                  <li key={lift.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {resolveProgramExercise(lift, exercises)?.name ?? lift.unresolvedName ?? lift.exerciseId}
                      {!resolveProgramExercise(lift, exercises) ? (
                        <Badge tone="muted" className="ml-2">
                          not in library
                        </Badge>
                      ) : null}
                      <span className="ml-2 text-xs text-subtle">
                        {lift.targetSets} × {lift.targetRepMin ?? "—"}–{lift.targetRepMax ?? "—"} · {lift.rule.kind.replace("_", " ")}
                      </span>
                      {lift.substitutionOf ? (
                        <Badge tone="muted" className="ml-2">
                          sub
                        </Badge>
                      ) : null}
                    </span>
                    <button type="button" className="text-xs text-muted" onClick={() => setSwapId(lift.id)}>
                      Substitute
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <Button
        className="mt-8 w-full"
        variant="danger"
        onClick={() => {
          if (window.confirm("Remove this program from the device?")) {
            deleteProgram(id);
            void navigate({ to: "/programs" });
          }
        }}
      >
        Delete program
      </Button>
      <Button className="mt-2 w-full" variant="ghost" asChild>
        <Link to="/programs">All programs</Link>
      </Button>

      <ExercisePicker
        open={Boolean(swapId)}
        onClose={() => setSwapId(null)}
        onPick={(exercise) => {
          if (swapId) substituteProgramExercise(swapId, exercise.id);
          setSwapId(null);
        }}
      />
    </Page>
  );
}
