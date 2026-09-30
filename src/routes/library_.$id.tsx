import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Page } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Card, Stat } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { titleCase } from "@/domain/taxonomy";
import { formatLocalDate } from "@/domain/time";
import { formatWeight, formatWeightWithUnit, roundEstimateG, weightUnitFor } from "@/domain/units";
import { bestOneRepMax } from "@/domain/oneRepMax";
import { formatRatio, relativeStrength } from "@/domain/relativeStrength";
import { e1rmSeries } from "@/lib/gym/analytics";
import { autopsyLift } from "@/lib/gym/autopsy";
import { buildLiftDna } from "@/lib/gym/dna";
import { progressExercise, actionLabel } from "@/lib/gym/progression";
import { CitedSessions } from "@/components/app/cited-sessions";
import { NumberReceiptSheet } from "@/components/app/number-receipt-sheet";
import { e1rmReceipt } from "@/lib/gym/number-receipts";
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
  const updateExercise = useGym((s) => s.updateExercise);
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
  const [receiptOpen, setReceiptOpen] = useState(false);

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
  const relative = latest?.best
    ? relativeStrength(latest.best.value, latest.slice.workout.localDate, measurements)
    : null;
  const call = progressExercise({
    exerciseId: id,
    exerciseName: exercise.name,
    trackingType: exercise.trackingType,
    incrementG: exercise.incrementG ?? settings.quickIncrementG,
    slices,
    formula: settings.oneRepMaxFormula,
    excludeWarmups: settings.excludeWarmupsFromAnalytics,
  });
  const dna = buildLiftDna(
    exercise,
    slices,
    settings.oneRepMaxFormula,
    settings.excludeWarmupsFromAnalytics,
  );
  const autopsy = autopsyLift(
    board.find((row) => row.exerciseId === id) ?? call,
    slices,
    settings.oneRepMaxFormula,
    settings.excludeWarmupsFromAnalytics,
  );
  const latestReceipt = latest
    ? e1rmReceipt(id, latest.slice.workout.id, slices, settings.oneRepMaxFormula)
    : null;
  const table = rmTable(id, slices, settings.excludeWarmupsFromAnalytics);
  const pinned = lessons.filter((row) => row.exerciseId === id);

  return (
    <Page>
      <p className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">
        {titleCase(exercise.primaryMuscleGroup)} · {titleCase(exercise.equipment)}
      </p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">{exercise.name}</h1>
      <Card className="mt-5">
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between text-left"
          aria-pressed={!!exercise.unilateral}
          onClick={() => updateExercise(exercise.id, { unilateral: !exercise.unilateral })}
        >
          <span>
            <span className="block text-sm">Log each side separately</span>
            <span className="block text-xs text-subtle">
              Adds a left and a right row per set. A pair counts as one set. Applies to workouts you
              start from now on.
            </span>
          </span>
          <span
            className={
              exercise.unilateral ? "text-sm font-medium text-accent" : "text-sm text-subtle"
            }
          >
            {exercise.unilateral ? "On" : "Off"}
          </span>
        </button>
      </Card>
      <Card className="mt-3">
        <p className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">
          Progression
        </p>
        <p className="mt-1 font-display text-2xl font-semibold">{actionLabel(call.action)}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{call.why}</p>
        <CitedSessions cites={call.cites} lift={call.exerciseName} />
        <p className="mt-2 font-mono text-xs text-subtle">
          Hit rate {Math.round(call.hitRate * 100)}% · miss streak {call.missStreak}
          {call.typicalExposuresToProgress
            ? ` · usually ${call.typicalExposuresToProgress} exposures`
            : ""}
        </p>
      </Card>

      <Card className="mt-3">
        <p className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">Lift DNA</p>
        <p className="mt-1 font-display text-2xl font-semibold tracking-tight">
          {dna.personality === "reps"
            ? "Reps first"
            : dna.personality === "load"
              ? "Load jumper"
              : "Mixed"}
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
          <p className="text-micro font-medium uppercase tracking-[0.16em] text-warning">
            Plateau autopsy
          </p>
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight">
            {autopsy.headline}
          </p>
          <div className="mt-3 space-y-3">
            {autopsy.findings.map((finding) => (
              <div key={finding.code}>
                <p className="text-sm font-medium">{finding.title}</p>
                <p className="mt-1 text-sm text-muted">{finding.detail}</p>
                <p className="mt-1 font-mono text-micro text-subtle">{finding.evidence}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Card className="p-0">
          {latestReceipt?.provenance.best ? (
            <button
              type="button"
              className="min-h-11 w-full rounded-2xl p-3 text-left hover:bg-raised"
              onClick={() => setReceiptOpen(true)}
              data-testid="latest-e1rm"
              aria-label={`Latest estimated 1RM ${formatWeightWithUnit(roundEstimateG(latestReceipt.provenance.best.value, unit), unit)}: show the working`}
            >
              <Stat
                label="Latest e1RM"
                value={formatWeightWithUnit(roundEstimateG(latestReceipt.provenance.best.value, unit), unit)}
                hint="Tap for the working"
              />
            </button>
          ) : (
            <div className="p-3">
              <Stat label="Latest e1RM" value="—" />
            </div>
          )}
        </Card>
        <Card className="p-3">
          <Stat label="Sessions" value={history.length} />
        </Card>
      </div>
      {latest?.best ? (
        <Card className="mt-3" data-testid="relative-strength">
          <p className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">
            Est. 1RM ÷ body weight
          </p>
          {relative ? (
            <>
              <p className="mt-1 font-display text-2xl font-semibold tabular">
                {formatRatio(relative.ratio)}
              </p>
              <p className="mt-2 text-xs text-muted">
                Est. 1RM {formatWeightWithUnit(relative.e1rmG, unit)} on{" "}
                {formatLocalDate(relative.e1rmDate)}, body weight{" "}
                {formatWeightWithUnit(relative.bodyweightG, unit)} on{" "}
                {formatLocalDate(relative.bodyweightDate)}. Just the ratio: there is no scale to
                place it on.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              No body weight recorded on or before this lift.{" "}
              <Link to="/body" className="text-accent underline-offset-2 hover:underline">
                Add one
              </Link>
              .
            </p>
          )}
        </Card>
      ) : null}

      {table.length > 0 ? (
        <Card className="mt-3">
          <p className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">
            Rep maxes
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {table.map((mark) => (
              <div key={mark.reps}>
                <p className="text-micro-legacy uppercase tracking-[0.14em] text-subtle">{mark.reps}RM</p>
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
              <Area
                type="monotone"
                dataKey="e1rm"
                stroke="var(--rf-accent)"
                fill="var(--rf-accent)"
                fillOpacity={0.16}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      ) : null}

      <Card className="mt-4">
        <p className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">
          Machine memory
        </p>
        <p className="mt-1 text-sm text-muted">
          Seat, handles, pin quirks. Surfaces the next time this movement is logged.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Input
            placeholder="Gym"
            value={machine.gymName}
            onChange={(event) => setMachine({ ...machine, gymName: event.target.value })}
          />
          <Input
            placeholder="Seat"
            value={machine.seat}
            onChange={(event) => setMachine({ ...machine, seat: event.target.value })}
          />
          <Input
            placeholder="Handle"
            value={machine.handle}
            onChange={(event) => setMachine({ ...machine, handle: event.target.value })}
          />
          <Input
            placeholder="Lever"
            value={machine.lever}
            onChange={(event) => setMachine({ ...machine, lever: event.target.value })}
          />
          <Input
            placeholder="Pin"
            value={machine.pin}
            onChange={(event) => setMachine({ ...machine, pin: event.target.value })}
          />
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
        <p className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">Lessons</p>
        <div className="mt-3 flex gap-2">
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Seat 4, handles neutral"
          />
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
              <button
                type="button"
                className="text-xs text-subtle"
                onClick={() => deleteLesson(row.id)}
              >
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
                    set.weightG
                      ? `${formatWeight(set.weightG, unit)} × ${set.reps ?? "—"}`
                      : `${set.reps ?? "—"} reps`,
                  )
                  .join("  ·  ")}
              </p>
              {best ? (
                <p className="mt-1 text-xs text-subtle">
                  e1RM {formatWeightWithUnit(best.value, unit)}
                </p>
              ) : null}
            </Card>
          </Link>
        ))}
      </div>
      {latestReceipt ? (
        <NumberReceiptSheet
          open={receiptOpen}
          onClose={() => setReceiptOpen(false)}
          lift={exercise.name}
          receipt={latestReceipt}
          unit={unit}
        />
      ) : null}
    </Page>
  );
}
