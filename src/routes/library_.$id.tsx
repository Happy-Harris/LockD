import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Page } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Card, Stat } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { titleCase } from "@/domain/taxonomy";
import { formatLocalDate } from "@/domain/time";
import { formatWeight, formatWeightWithUnit, weightUnitFor } from "@/domain/units";
import { bestOneRepMax } from "@/domain/oneRepMax";
import { bandLabel, classifyE1rm, findStandard, scaleStandard } from "@/domain/standards";
import { e1rmSeries } from "@/lib/gym/analytics";
import { autopsyLift } from "@/lib/gym/autopsy";
import { buildLiftDna } from "@/lib/gym/dna";
import { progressExercise, actionLabel } from "@/lib/gym/progression";
import { rmTable } from "@/lib/gym/queue";
import { useGymDerived, useSlices } from "@/lib/gym/hooks";
import { useGym } from "@/lib/gym/store";

export const Route = createFileRoute("/library_/$id")({ component: ExerciseDetailPage });

function ExerciseDetailPage() {
  const { id } = Route.useParams();
  const exercises = useGym((s) => s.exercises);
  const settings = useGym((s) => s.settings);
  const measurements = useGym((s) => s.measurements);
  const machineSetups = useGym((s) => s.machineSetups);
  const lessons = useGym((s) => s.lessons);
  const upsertMachineSetup = useGym((s) => s.upsertMachineSetup);
  const pinLesson = useGym((s) => s.pinLesson);
  const deleteLesson = useGym((s) => s.deleteLesson);
  const slices = useSlices();
  const { board } = useGymDerived();
  const exercise = exercises.find((row) => row.id === id);
  const unit = weightUnitFor(settings.unitSystem);
  const setup = machineSetups.find((row) => row.exerciseId === id);
  const [machine, setMachine] = useState({
    gymName: setup?.gymName ?? "",
    seat: setup?.seat ?? "",
    lever: setup?.lever ?? "",
    handle: setup?.handle ?? "",
    pin: setup?.pin ?? "",
    stackNote: setup?.stackNote ?? "",
    notes: setup?.notes ?? "",
  });
  const [note, setNote] = useState("");

  if (!exercise) {
    return (
      <Page>
        <p className="text-sm text-muted">Exercise not found.</p>
      </Page>
    );
  }

  const history = slices
    .map((slice) => {
      const row = slice.exercises.find((item) => item.exerciseId === id);
      if (!row) return null;
      const sets = slice.sets.filter((set) => set.workoutExerciseId === row.id && set.isCompleted);
      if (sets.length === 0) return null;
      const best = bestOneRepMax(sets, settings.oneRepMaxFormula);
      return { slice, sets, best };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .reverse();

  const series = e1rmSeries(id, slices, settings.oneRepMaxFormula).map((point) => ({
    date: point.date.slice(5),
    e1rm: Number(formatWeight(point.value, unit)),
  }));
  const latest = history[0];
  const standard = findStandard(id);
  const bodyweight = [...measurements].reverse().find((row) => row.metric === "bodyweight")?.value;
  const classified =
    standard && latest?.best ? classifyE1rm(latest.best.value, standard, bodyweight) : null;
  const call = progressExercise({
    exerciseId: id,
    exerciseName: exercise.name,
    trackingType: exercise.trackingType,
    incrementG: exercise.incrementG ?? settings.quickIncrementG,
    slices,
    formula: settings.oneRepMaxFormula,
    excludeWarmups: settings.excludeWarmupsFromAnalytics,
  });
  const dna = buildLiftDna(exercise, slices, settings.oneRepMaxFormula, settings.excludeWarmupsFromAnalytics);
  const autopsy = autopsyLift(
    board.find((row) => row.exerciseId === id) ?? call,
    slices,
    settings.oneRepMaxFormula,
    settings.excludeWarmupsFromAnalytics,
  );
  const table = rmTable(id, slices, settings.excludeWarmupsFromAnalytics);
  const pinned = lessons.filter((row) => row.exerciseId === id);

  return (
    <Page>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
        {titleCase(exercise.primaryMuscleGroup)} · {titleCase(exercise.equipment)}
      </p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">{exercise.name}</h1>
      <Card className="mt-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Progression</p>
        <p className="mt-1 font-display text-2xl font-semibold">{actionLabel(call.action)}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{call.why}</p>
        <p className="mt-2 font-mono text-xs text-subtle">
          Hit rate {Math.round(call.hitRate * 100)}% · miss streak {call.missStreak}
          {call.typicalExposuresToProgress ? ` · usually ${call.typicalExposuresToProgress} exposures` : ""}
        </p>
      </Card>

      <Card className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Lift DNA</p>
        <p className="mt-1 font-display text-2xl font-semibold tracking-tight">
          {dna.personality === "reps" ? "Reps first" : dna.personality === "load" ? "Load jumper" : "Mixed"}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{dna.personalityWhy}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat label="Exposures" value={dna.exposures} />
          <Stat label="Best range" value={dna.strongestRange ?? "—"} />
          <Stat label="Best day" value={dna.bestWeekday ?? "—"} />
          <Stat
            label="Before a jump"
            value={dna.exposuresBeforeJump ? `${dna.exposuresBeforeJump}×` : "—"}
          />
        </div>
        {dna.learnedRestSeconds ? (
          <p className="mt-3 text-xs text-subtle">Learned rest {dna.learnedRestSeconds}s</p>
        ) : null}
        <ul className="mt-3 space-y-1">
          {dna.notes.map((line) => (
            <li key={line} className="text-xs leading-relaxed text-muted">
              {line}
            </li>
          ))}
        </ul>
      </Card>

      {autopsy.stalled || autopsy.findings.length > 0 ? (
        <Card className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-warning">Plateau autopsy</p>
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight">{autopsy.headline}</p>
          <div className="mt-3 space-y-3">
            {autopsy.findings.map((finding) => (
              <div key={finding.code}>
                <p className="text-sm font-medium">{finding.title}</p>
                <p className="mt-1 text-sm text-muted">{finding.detail}</p>
                <p className="mt-1 font-mono text-[11px] text-subtle">{finding.evidence}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Card className="p-3">
          <Stat
            label="Best e1RM"
            value={latest?.best ? formatWeightWithUnit(latest.best.value, unit) : "—"}
          />
        </Card>
        <Card className="p-3">
          <Stat label="Sessions" value={history.length} />
        </Card>
      </div>
      {classified && standard ? (
        <Card className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Strength standard</p>
          <p className="mt-1 font-display text-2xl font-semibold">{bandLabel(classified.band)}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
            <div className="h-full bg-accent" style={{ width: `${Math.round(classified.progress * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {classified.next
              ? `Next: ${bandLabel(classified.next)} at ${formatWeightWithUnit(scaleStandard(standard, bodyweight)[classified.next], unit)}`
              : "Elite band."}{" "}
            Scaled to bodyweight when one is on file.
          </p>
        </Card>
      ) : null}

      {table.length > 0 ? (
        <Card className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Rep maxes</p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {table.map((mark) => (
              <div key={mark.reps}>
                <p className="text-[10px] uppercase tracking-[0.14em] text-subtle">{mark.reps}RM</p>
                <p className="font-mono text-sm tabular">{formatWeight(mark.weightG, unit)}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {series.length > 1 ? (
        <Card className="mt-4 h-40 p-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <Area type="monotone" dataKey="e1rm" stroke="var(--rf-accent)" fill="var(--rf-accent)" fillOpacity={0.16} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      ) : null}

      <Card className="mt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Machine memory</p>
        <p className="mt-1 text-sm text-muted">Seat, handles, pin quirks. Surfaces the next time this movement is logged.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Input placeholder="Gym" value={machine.gymName} onChange={(event) => setMachine({ ...machine, gymName: event.target.value })} />
          <Input placeholder="Seat" value={machine.seat} onChange={(event) => setMachine({ ...machine, seat: event.target.value })} />
          <Input placeholder="Handle" value={machine.handle} onChange={(event) => setMachine({ ...machine, handle: event.target.value })} />
          <Input placeholder="Lever" value={machine.lever} onChange={(event) => setMachine({ ...machine, lever: event.target.value })} />
          <Input placeholder="Pin" value={machine.pin} onChange={(event) => setMachine({ ...machine, pin: event.target.value })} />
          <Input
            placeholder="Stack lies?"
            value={machine.stackNote}
            onChange={(event) => setMachine({ ...machine, stackNote: event.target.value })}
          />
        </div>
        <Input
          className="mt-2"
          placeholder="Notes"
          value={machine.notes}
          onChange={(event) => setMachine({ ...machine, notes: event.target.value })}
        />
        <Button
          className="mt-3 w-full"
          variant="secondary"
          onClick={() => upsertMachineSetup({ exerciseId: id, ...machine })}
        >
          Remember setup
        </Button>
      </Card>

      <Card className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Lessons</p>
        <div className="mt-3 flex gap-2">
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Seat 4, handles neutral" />
          <Button
            variant="secondary"
            onClick={() => {
              pinLesson(id, note);
              setNote("");
            }}
          >
            Pin
          </Button>
        </div>
        <ul className="mt-3 space-y-2">
          {pinned.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 text-sm">
              <span>{row.text}</span>
              <button type="button" className="text-xs text-subtle" onClick={() => deleteLesson(row.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-5 space-y-2">
        {history.map(({ slice, sets, best }) => (
          <Link key={slice.workout.id} to="/history/$id" params={{ id: slice.workout.id }}>
            <Card>
              <p className="text-sm font-medium">{formatLocalDate(slice.workout.localDate)}</p>
              <p className="mt-1 text-sm text-muted">
                {sets
                  .map((set) =>
                    set.weightG ? `${formatWeight(set.weightG, unit)} × ${set.reps ?? "—"}` : `${set.reps ?? "—"} reps`,
                  )
                  .join("  ·  ")}
              </p>
              {best ? (
                <p className="mt-1 text-xs text-subtle">e1RM {formatWeightWithUnit(best.value, unit)}</p>
              ) : null}
            </Card>
          </Link>
        ))}
      </div>
    </Page>
  );
}
