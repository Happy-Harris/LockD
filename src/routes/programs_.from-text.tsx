import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Page } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { defaultQuickIncrementG } from "@/domain/units";
import { useImportProgram } from "@/lib/gym/program-hooks";
import { useGym } from "@/lib/gym/store";
import { exerciseNameKey } from "@/lib/import/engine";
import { buildProgramFromText, parseProgramText, programTextNames } from "@/lib/import/program-text";

/**
 * Program from text (Opp 11). Paste a program, see exactly what was understood and every line that was
 * not, and only then save. A fixed grammar reads the text on this device; nothing is guessed and nothing
 * is written until "Save program".
 */

export const Route = createFileRoute("/programs_/from-text")({ component: ProgramFromTextPage });

const EXAMPLE = `Push Pull Legs
Week 1
Day 1: Push
Bench Press 3x8-12 @ RPE 8 rest 90s
Overhead Press 3 x 8
Day 2: Pull
Barbell Row 4 sets of 6
Week 2: deload`;

export function ProgramFromTextPage() {
  const navigate = useNavigate();
  const importProgram = useImportProgram();
  const exercises = useGym((s) => s.exercises);
  const settings = useGym((s) => s.settings);
  const [text, setText] = useState("");
  const [accepted, setAccepted] = useState<ReadonlyMap<string, string>>(new Map());

  const parsed = useMemo(() => parseProgramText(text), [text]);
  const { step } = useMemo(() => programTextNames(parsed, exercises), [parsed, exercises]);
  const built = useMemo(
    () =>
      buildProgramFromText(
        parsed,
        exercises,
        {
          lens: "general",
          restSeconds: settings.defaultRestSeconds,
          incrementG: defaultQuickIncrementG(settings.unitSystem),
        },
        accepted,
      ),
    [parsed, exercises, settings.defaultRestSeconds, settings.unitSystem, accepted],
  );

  const rowCount = parsed.sessions.reduce((sum, session) => sum + session.exercises.length, 0);
  const pending = step.candidates.filter((candidate) => !accepted.has(exerciseNameKey(candidate.name)));
  const setChoice = (name: string, exerciseId: string | null) => {
    const next = new Map(accepted);
    if (exerciseId) next.set(exerciseNameKey(name), exerciseId);
    else next.delete(exerciseNameKey(name));
    setAccepted(next);
  };

  return (
    <Page>
      <Link to="/programs" className="text-sm text-muted">
        ← Programs
      </Link>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">Program from text</h1>
      <p className="mt-1 text-sm text-muted">
        Paste a program. Lock&rsquo;d reads it with fixed rules on this device, shows what it understood and every line it
        did not use, and saves only when you tap Save program.
      </p>

      <label className="mt-6 block">
        <span className="mb-1 block text-xs text-subtle">Your program</span>
        <textarea
          data-testid="program-text"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setAccepted(new Map());
          }}
          rows={10}
          spellCheck={false}
          placeholder={EXAMPLE}
          className="block w-full rounded-xl border border-line bg-surface p-3 font-mono text-sm text-ink placeholder:text-subtle"
        />
      </label>
      <details className="mt-2 text-sm text-muted">
        <summary className="min-h-11 cursor-pointer py-2">What can I write?</summary>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>A name on the first line.</li>
          <li>&ldquo;Week 2&rdquo; or &ldquo;Week 3: deload&rdquo;, and &ldquo;Day 1&rdquo; or &ldquo;Day A: Upper&rdquo;.</li>
          <li>&ldquo;Bench Press 3x8&rdquo;, &ldquo;3 x 8-12&rdquo; or &ldquo;4 sets of 6&rdquo;, with optional &ldquo;@ RPE 8&rdquo; and &ldquo;rest 90s&rdquo;.</li>
          <li>&ldquo;#&rdquo; starts a comment. A note goes after &ldquo;|&rdquo; or &ldquo;;&rdquo;.</li>
          <li>Loads, weeks that differ and supersets are not stored yet. They are listed, not lost.</li>
        </ul>
      </details>

      {rowCount === 0 && parsed.unused.length === 0 ? (
        <p className="mt-6 text-sm text-muted" data-testid="program-text-empty">
          Nothing read yet.
        </p>
      ) : (
        <>
          <section className="mt-6" data-testid="program-preview">
            <h2 className="font-display text-2xl font-semibold tracking-tight">{built.file.program.name}</h2>
            <p className="mt-1 text-sm text-muted">
              {built.file.weeks.length} {built.file.weeks.length === 1 ? "week" : "weeks"} · {parsed.sessions.length}{" "}
              {parsed.sessions.length === 1 ? "session" : "sessions"} · {rowCount} {rowCount === 1 ? "exercise" : "exercises"}
              {built.file.weeks.some((w) => w.isDeload)
                ? ` · deload week ${built.file.weeks.filter((w) => w.isDeload).map((w) => w.weekNumber).join(", ")}`
                : ""}
            </p>
            <div className="mt-3 space-y-3">
              {built.file.sessions.map((session) => (
                <Card key={session.order}>
                  <p className="font-medium">{session.name}</p>
                  <ul className="mt-2 space-y-2">
                    {session.exercises.map((row, index) => (
                      <li key={index} className="text-sm">
                        <span className="font-medium">{parsed.sessions[session.order].exercises[index].name}</span>
                        <span className="text-muted">
                          {" "}
                          · {row.targetSets} × {row.targetRepMin}
                          {row.targetRepMax !== row.targetRepMin ? `–${row.targetRepMax}` : ""}
                          {row.targetRpe !== undefined ? ` · RPE ${row.targetRpe}` : ""} · rest {row.restSeconds} s
                        </span>
                        <span className="block text-xs text-subtle">
                          {row.exerciseId
                            ? `In your library as ${row.exerciseName}`
                            : "Not in your library yet; it stays in the program and is skipped when you start it"}
                        </span>
                        {row.notes ? <span className="block text-xs text-subtle">Note: {row.notes}</span> : null}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </section>

          {step.candidates.length > 0 ? (
            <section className="mt-6" data-testid="program-candidates">
              <h2 className="text-sm font-medium">Might be an exercise you have</h2>
              <p className="mt-1 text-xs text-subtle">Lock&rsquo;d only suggests. Nothing is linked until you tap.</p>
              <div className="mt-2 space-y-2">
                {step.candidates.map((candidate) => {
                  const chosen = accepted.get(exerciseNameKey(candidate.name)) === candidate.exercise.id;
                  return (
                    <Card key={candidate.name} className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm">
                        &ldquo;{candidate.name}&rdquo; · {candidate.exercise.name}?
                      </p>
                      <Button
                        size="sm"
                        variant={chosen ? "primary" : "secondary"}
                        onClick={() => setChoice(candidate.name, chosen ? null : candidate.exercise.id)}
                      >
                        {chosen ? "Same exercise ✓" : "Same exercise"}
                      </Button>
                    </Card>
                  );
                })}
              </div>
            </section>
          ) : null}

          {built.filledIn.length > 0 ? (
            <section className="mt-6" data-testid="program-filled-in">
              <h2 className="text-sm font-medium">Filled in, not in your text</h2>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {built.filledIn.map((item) => (
                  <li key={item.field}>
                    {item.field}: {item.value}{" "}
                    <span className="text-subtle">({item.source})</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-6" data-testid="program-unused">
            <h2 className="text-sm font-medium">
              {parsed.unused.length === 0
                ? "Every line was used"
                : `${parsed.unused.length} ${parsed.unused.length === 1 ? "line" : "lines"} not used`}
            </h2>
            {parsed.unused.length > 0 ? (
              <ul className="mt-2 space-y-2 text-sm">
                {parsed.unused.map((row, index) => (
                  <li key={index} className="rounded-xl border border-line p-3">
                    <span className="text-subtle">Line {row.line}:</span> <span className="font-mono">{row.text}</span>
                    <span className="block text-xs text-muted">{row.reason}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <div className="mt-6">
            <Button
              className="w-full"
              disabled={rowCount === 0}
              data-testid="program-save"
              onClick={() => {
                const id = importProgram(built.file);
                void navigate({ to: "/programs/$id", params: { id } });
              }}
            >
              Save program
            </Button>
            {pending.length > 0 ? (
              <p className="mt-2 text-xs text-subtle">
                {pending.length} {pending.length === 1 ? "name is" : "names are"} not linked yet. You can save now and
                link {pending.length === 1 ? "it" : "them"} later.
              </p>
            ) : null}
          </div>
        </>
      )}
    </Page>
  );
}
