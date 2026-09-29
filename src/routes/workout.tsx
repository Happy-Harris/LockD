import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  Flame,
  Link2,
  Minus,
  Plus,
  Timer,
  Trash2,
  Video,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ExercisePicker } from "@/components/app/exercise-picker";
import { Page } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { SET_TYPES, titleCase, usesReps, usesWeight } from "@/domain/taxonomy";
import { elapsedSeconds } from "@/domain/time";
import { setCountKey } from "@/domain/volume";
import type { GrindFeel, IntensityMode, SetType, WorkoutSet } from "@/domain/types";
import {
  formatDuration,
  formatWeightInput,
  parseRepsInput,
  parseWeightInput,
  weightUnitFor,
} from "@/domain/units";
import { uuid } from "@/domain/ids";
import {
  compareSet,
  findGhostSlice,
  formatGhostSet,
  ghostHeader,
  ghostSetsForExercise,
} from "@/lib/gym/ghost";
import { progressExercise, actionLabel } from "@/lib/gym/progression";
import {
  intensityChoices,
  intensityLabel,
  intensityPatch,
  intensityValue,
} from "@/lib/gym/intensity";
import { useSlices } from "@/lib/gym/hooks";
import { priorForSlot, slotOf } from "@/lib/gym/pairs";
import { supersetLabels } from "@/lib/gym/superset";
import { barbellSnap } from "@/lib/gym/loads";
import { useGym } from "@/lib/gym/store";
import { putClipBlob } from "@/lib/gym/vault";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workout")({ component: ActiveWorkoutPage });

function ActiveWorkoutPage() {
  const navigate = useNavigate();
  const workouts = useGym((s) => s.workouts);
  const workout = workouts.find((row) => row.status === "active");
  const workoutExercises = useGym((s) => s.workoutExercises);
  const workoutSets = useGym((s) => s.workoutSets);
  const templateExercises = useGym((s) => s.templateExercises);
  const settings = useGym((s) => s.settings);
  const exercises = useGym((s) => s.exercises);
  const bars = useGym((s) => s.bars);
  const plates = useGym((s) => s.plates);
  const machineSetups = useGym((s) => s.machineSetups);
  const lessons = useGym((s) => s.lessons);
  const addExerciseToWorkout = useGym((s) => s.addExerciseToWorkout);
  const removeExerciseFromWorkout = useGym((s) => s.removeExerciseFromWorkout);
  const swapExercise = useGym((s) => s.swapExercise);
  const addSet = useGym((s) => s.addSet);
  const updateSet = useGym((s) => s.updateSet);
  const nudgeSetWeight = useGym((s) => s.nudgeSetWeight);
  const nudgeSetReps = useGym((s) => s.nudgeSetReps);
  const completeSet = useGym((s) => s.completeSet);
  const uncompleteSet = useGym((s) => s.uncompleteSet);
  const deleteSet = useGym((s) => s.deleteSet);
  const restoreSet = useGym((s) => s.restoreSet);
  const finishWorkout = useGym((s) => s.finishWorkout);
  const discardWorkout = useGym((s) => s.discardWorkout);
  const startRestTimer = useGym((s) => s.startRestTimer);
  const stopRestTimer = useGym((s) => s.stopRestTimer);
  const updateWorkout = useGym((s) => s.updateWorkout);
  const ensureWarmups = useGym((s) => s.ensureWarmups);
  const attachClip = useGym((s) => s.attachClip);
  const setSuperset = useGym((s) => s.setSuperset);
  const slices = useSlices();
  const [picker, setPicker] = useState<"add" | string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const leaving = useRef(false);

  useEffect(() => {
    if (!workout && !leaving.current) void navigate({ to: "/" });
  }, [workout, navigate]);

  const unit = weightUnitFor(settings.unitSystem);
  const increment = settings.quickIncrementG;

  const ghostSlice = useMemo(() => {
    if (!workout) return undefined;
    return findGhostSlice(slices, {
      beatWorkoutId: workout.beatWorkoutId,
      templateId: workout.templateId,
      name: workout.name,
      beforeIso: workout.startedAt,
    });
  }, [workout, slices]);

  const blocks = useMemo(() => {
    if (!workout) return [];
    return workoutExercises
      .filter((row) => row.workoutId === workout.id)
      .sort((a, b) => a.order - b.order)
      .map((exercise) => ({
        exercise,
        sets: workoutSets
          .filter((set) => set.workoutExerciseId === exercise.id)
          .sort((a, b) => a.order - b.order),
        prescription: templateExercises.find(
          (row) => row.templateId === workout.templateId && row.exerciseId === exercise.exerciseId,
        ),
        ghost: ghostSetsForExercise(ghostSlice, exercise.exerciseId),
        setup: machineSetups.find((row) => row.exerciseId === exercise.exerciseId),
        lesson: [...lessons].reverse().find((row) => row.exerciseId === exercise.exerciseId),
        catalog: exercises.find((row) => row.id === exercise.exerciseId),
      }));
  }, [
    workout,
    workoutExercises,
    workoutSets,
    templateExercises,
    ghostSlice,
    machineSetups,
    lessons,
    exercises,
  ]);

  // Depends on finished sessions, not on the sets being edited, so a keystroke does not redo it.
  const suggestions = useMemo(() => {
    const out = new Map<string, ReturnType<typeof progressExercise>>();
    if (!workout) return out;
    for (const exercise of workoutExercises) {
      if (exercise.workoutId !== workout.id) continue;
      const prescription = templateExercises.find(
        (row) => row.templateId === workout.templateId && row.exerciseId === exercise.exerciseId,
      );
      const catalog = exercises.find((row) => row.id === exercise.exerciseId);
      out.set(
        exercise.id,
        progressExercise({
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseNameSnapshot,
          trackingType: exercise.trackingTypeSnapshot,
          incrementG: catalog?.incrementG ?? settings.quickIncrementG,
          targetRepMin: prescription?.targetRepMin,
          targetRepMax: prescription?.targetRepMax,
          targetSets: prescription?.targetSets,
          slices,
          formula: settings.oneRepMaxFormula,
          excludeWarmups: settings.excludeWarmupsFromAnalytics,
          snap: catalog ? barbellSnap(catalog, bars, plates, settings) : undefined,
        }),
      );
    }
    return out;
  }, [workout, workoutExercises, templateExercises, exercises, bars, plates, settings, slices]);

  if (!workout) return null;
  const labels = supersetLabels(blocks.map((block) => block.exercise));

  // Sets, not rows: a left/right pair is one set, and counts as done once a side is done.
  const thisWorkout = workoutSets.filter((set) => set.workoutId === workout.id);
  const completed = new Set(thisWorkout.filter((set) => set.isCompleted).map(setCountKey)).size;
  const total = new Set(thisWorkout.map(setCountKey)).size;
  const workingDone = blocks.flatMap((block) =>
    block.sets
      .map((set, i) => ({ set, i }))
      .filter(({ set }) => set.isCompleted && set.setType !== "warmup")
      .map(({ set, i }, k) => ({
        set,
        ghost: set.side ? ghostForRow(block.sets, block.ghost, i) : block.ghost[k],
      })),
  );
  const beats = workingDone.filter(
    ({ set, ghost }) => compareSet(set, ghost).verdict === "beat",
  ).length;

  const finish = () => {
    leaving.current = true;
    const id = workout.id;
    stopRestTimer();
    finishWorkout(id);
    void navigate({ to: "/workout/$id/summary", params: { id } });
  };

  return (
    <Page hideNav>
      <header className="mb-3 flex items-center gap-2">
        <button
          type="button"
          className="grid size-11 place-items-center rounded-xl hover:bg-raised"
          onClick={() => void navigate({ to: "/" })}
          aria-label="Back"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={workout.name}
            onChange={(event) => updateWorkout(workout.id, { name: event.target.value })}
            className="w-full bg-transparent font-display text-2xl font-semibold tracking-tight text-ink outline-none"
          />
          <p className="font-mono text-xs text-muted tabular">
            <ElapsedClock startedAt={workout.startedAt} pausedSeconds={workout.pausedSeconds} /> ·{" "}
            {completed}/{total || 0} sets
            {beats > 0 ? ` · ${beats} beat last time` : ""}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setConfirmDiscard(true)}>
          Discard
        </Button>
        <Button size="sm" onClick={finish}>
          Finish
        </Button>
      </header>

      {ghostSlice ? (
        <p className="mb-4 rounded-2xl bg-paper px-4 py-3 font-mono text-xs text-paper-ink">
          {ghostHeader(workout, ghostSlice)} · racing {ghostSlice.workout.name}
        </p>
      ) : null}

      <div className="space-y-4">
        {blocks.map((block, blockIndex) => {
          const nextBlock = blocks[blockIndex + 1];
          const linkedWithNext =
            !!block.exercise.supersetGroup &&
            nextBlock?.exercise.supersetGroup === block.exercise.supersetGroup;
          const tracking = block.exercise.trackingTypeSnapshot;
          const target =
            block.prescription?.targetRepMin && block.prescription.targetRepMax
              ? `${block.prescription.targetSets} × ${block.prescription.targetRepMin}–${block.prescription.targetRepMax}`
              : null;
          const blockIncrement = block.catalog?.incrementG ?? increment;
          const suggestion = suggestions.get(block.exercise.id);
          const restHint = block.exercise.restSeconds;
          return (
            <article key={block.exercise.id} className="rounded-[28px] bg-surface p-4 hairline">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">
                    {labels.get(block.exercise.id) ? (
                      <span className="mr-2 rounded-lg bg-accent px-1.5 py-0.5 align-middle font-mono text-xs text-accent-ink">
                        {labels.get(block.exercise.id)}
                      </span>
                    ) : null}
                    {block.exercise.exerciseNameSnapshot}
                  </h2>
                  <p className="text-xs text-muted">
                    {titleCase(block.exercise.primaryMuscleGroupSnapshot)}
                    {target ? ` · ${target}` : ""}
                    {` · rest ${restHint}s`}
                  </p>
                </div>
                <div className="flex">
                  {nextBlock ? (
                    <button
                      type="button"
                      className={cn(
                        "grid size-11 place-items-center rounded-xl hover:bg-raised",
                        linkedWithNext ? "text-accent" : "text-subtle",
                      )}
                      aria-pressed={linkedWithNext}
                      aria-label={
                        linkedWithNext
                          ? `Unlink ${block.exercise.exerciseNameSnapshot} from the next exercise`
                          : `Superset ${block.exercise.exerciseNameSnapshot} with the next exercise`
                      }
                      onClick={() => setSuperset(block.exercise.id, !linkedWithNext)}
                    >
                      <Link2 className="size-4" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="grid size-11 place-items-center rounded-xl text-subtle hover:bg-raised"
                    onClick={() =>
                      startRestTimer(
                        restHint,
                        workout.id,
                        undefined,
                        block.exercise.exerciseNameSnapshot,
                      )
                    }
                    aria-label="Start rest"
                  >
                    <Timer className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="grid size-11 place-items-center rounded-xl text-subtle hover:bg-raised"
                    onClick={() => removeExerciseFromWorkout(block.exercise.id)}
                    aria-label="Remove exercise"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              {block.setup ? (
                <p className="mb-2 font-mono text-[11px] text-subtle">
                  Setup {block.setup.gymName ? `· ${block.setup.gymName}` : ""}
                  {block.setup.seat ? ` · seat ${block.setup.seat}` : ""}
                  {block.setup.handle ? ` · ${block.setup.handle}` : ""}
                  {block.setup.lever ? ` · lever ${block.setup.lever}` : ""}
                  {block.setup.pin ? ` · pin ${block.setup.pin}` : ""}
                  {block.setup.stackNote ? ` · ${block.setup.stackNote}` : ""}
                </p>
              ) : null}
              {block.lesson ? (
                <p className="mb-2 text-xs leading-relaxed text-muted">
                  Pinned: {block.lesson.text}
                </p>
              ) : null}
              {block.ghost.length > 0 ? (
                <p className="mb-2 font-mono text-xs text-subtle">
                  Ghost: {block.ghost.map((set) => formatGhostSet(set, unit)).join("  ")}
                </p>
              ) : null}
              {suggestion?.why ? (
                <p className="mb-3 text-xs leading-relaxed text-muted">
                  <span className="font-medium text-ink">{actionLabel(suggestion.action)}. </span>
                  {suggestion.why}
                </p>
              ) : null}

              <div className="space-y-2">
                {block.sets.map((set, index) => {
                  const ghost = ghostForRow(block.sets, block.ghost, index);
                  const number = set.side ? slotOf(block.sets, index).pairIndex + 1 : index + 1;
                  return (
                    <SetRow
                      key={set.id}
                      set={set}
                      number={number}
                      unit={unit}
                      incrementG={blockIncrement}
                      showWeight={usesWeight(tracking)}
                      showReps={usesReps(tracking)}
                      intensityMode={settings.intensityMode}
                      ghost={ghost}
                      targetMin={block.prescription?.targetRepMin}
                      targetMax={block.prescription?.targetRepMax}
                      onChange={(patch) => updateSet(set.id, patch)}
                      onNudgeWeight={(delta) => nudgeSetWeight(set.id, delta)}
                      onNudgeReps={(delta) => nudgeSetReps(set.id, delta)}
                      onToggle={() => {
                        if (set.isCompleted) uncompleteSet(set.id);
                        else {
                          const prs = completeSet(set.id);
                          if (prs.length)
                            toast(`${prs.map((pr) => pr.exerciseName).join(", ")} — new e1RM`);
                          const cmp = compareSet(set, ghost);
                          if (cmp.verdict === "beat") toast(`Beat last time · ${cmp.label}`);
                          if (cmp.verdict === "tie") toast("Tied last time");
                        }
                      }}
                      onDelete={() => {
                        deleteSet(set.id);
                        toast(`Set ${number}${set.side ? ` ${set.side}` : ""} deleted`, {
                          action: { label: "Undo", onClick: () => restoreSet(set) },
                        });
                      }}
                      onClip={async (file) => {
                        const id = uuid();
                        try {
                          await putClipBlob(id, file);
                          attachClip({
                            id,
                            setId: set.id,
                            workoutId: workout.id,
                            exerciseId: block.exercise.exerciseId,
                            exerciseName: block.exercise.exerciseNameSnapshot,
                            createdAt: new Date().toISOString(),
                            localDate: workout.localDate,
                            mimeType: file.type || "video/mp4",
                          });
                          toast("Clip locked to this set");
                        } catch (error) {
                          toast(error instanceof Error ? error.message : "Could not store clip");
                        }
                      }}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => addSet(block.exercise.id)}>
                  <Plus className="size-4" />
                  Add set
                </Button>
                <Button variant="ghost" size="sm" onClick={() => ensureWarmups(block.exercise.id)}>
                  <Zap className="size-4" />
                  Warm-up
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPicker(block.exercise.id)}>
                  Swap
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {blocks.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          No lifts yet. Add an exercise to start logging.
        </p>
      ) : null}

      <Button variant="secondary" className="mt-4 w-full" onClick={() => setPicker("add")}>
        <Plus className="size-4" />
        Add exercise
      </Button>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this session?"
        description="Every set logged in this session is deleted. This can't be undone."
        cancelLabel="Keep logging"
        confirmLabel="Discard session"
        onConfirm={() => {
          leaving.current = true;
          stopRestTimer();
          discardWorkout(workout.id);
          void navigate({ to: "/" });
        }}
      />

      <ExercisePicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        onPick={(exercise) => {
          if (picker && picker !== "add") swapExercise(picker, exercise.id);
          else addExerciseToWorkout(workout.id, exercise.id);
        }}
      />
    </Page>
  );
}

/** The previous-session set a row races. A sided row matches the same set number on the same side. */
function ghostForRow(
  sets: WorkoutSet[],
  ghosts: ReturnType<typeof ghostSetsForExercise>,
  index: number,
) {
  const row = sets[index]!;
  if (row.setType === "warmup") return undefined;
  if (row.side) return priorForSlot(ghosts, slotOf(sets, index), index);
  const ghostIndex =
    sets.slice(0, index + 1).filter((other) => other.setType !== "warmup").length - 1;
  return ghosts[Math.max(0, ghostIndex)];
}

/** The only part of the page that ticks, so the set rows do not re-render every second. */
function ElapsedClock({ startedAt, pausedSeconds }: { startedAt: string; pausedSeconds?: number }) {
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNow((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <>{formatDuration(elapsedSeconds(startedAt, undefined, pausedSeconds))}</>;
}

function SetRow({
  set,
  number,
  unit,
  incrementG,
  ghost,
  targetMin,
  targetMax,
  showWeight,
  showReps,
  intensityMode,
  onChange,
  onNudgeWeight,
  onNudgeReps,
  onToggle,
  onDelete,
  onClip,
}: {
  set: WorkoutSet;
  /** The set number shown. Both sides of a left/right pair share one. */
  number: number;
  unit: "kg" | "lb";
  incrementG: number;
  ghost?: { weightG?: number; reps?: number; rpe?: number };
  targetMin?: number;
  targetMax?: number;
  showWeight: boolean;
  showReps: boolean;
  intensityMode: IntensityMode;
  onChange: (patch: Partial<WorkoutSet>) => void;
  onNudgeWeight: (deltaG: number) => void;
  onNudgeReps: (delta: number) => void;
  onToggle: () => void;
  onDelete: () => void;
  onClip: (file: File) => void;
}) {
  const [weight, setWeight] = useState(() =>
    set.weightG != null ? formatWeightInput(set.weightG, unit) : "",
  );
  const [reps, setReps] = useState(() => (set.reps != null ? String(set.reps) : ""));
  const [pickingIntensity, setPickingIntensity] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setWeight(set.weightG != null ? formatWeightInput(set.weightG, unit) : "");
  }, [set.weightG, unit]);
  useEffect(() => {
    setReps(set.reps != null ? String(set.reps) : "");
  }, [set.reps]);

  const classification =
    set.isCompleted && set.reps != null && targetMin != null && targetMax != null
      ? set.reps < targetMin
        ? "under"
        : set.reps > targetMax
          ? "over"
          : "hit"
      : null;

  const typeLabel = SET_TYPES.find((entry) => entry.value === set.setType)?.short || "WK";
  const cmp = set.isCompleted ? compareSet(set, ghost) : null;
  const grindOrder: GrindFeel[] = ["easy", "normal", "grind"];

  return (
    <div className={cn("rounded-2xl bg-raised/70 p-2", set.isCompleted && "opacity-90")}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-6 text-center font-mono tabular text-muted",
            set.side ? "text-xs" : "text-sm",
          )}
        >
          {number}
          {set.side ? (set.side === "left" ? "L" : "R") : ""}
        </span>
        {showWeight ? (
          <Stepper
            value={weight}
            placeholder={ghost?.weightG != null ? formatWeightInput(ghost.weightG, unit) : "0"}
            ariaLabel={`Set ${number}${set.side ? ` ${set.side}` : ""} weight`}
            onMinus={() => onNudgeWeight(-incrementG)}
            onPlus={() => onNudgeWeight(incrementG)}
            onChange={(value) => {
              setWeight(value);
              onChange({ weightG: parseWeightInput(value, unit) });
            }}
          />
        ) : (
          <div className="flex-1" />
        )}
        <button
          type="button"
          className="h-11 w-11 shrink-0 rounded-xl bg-surface text-xs font-medium text-muted hairline"
          aria-label={`Set type ${set.setType}`}
          onClick={() => {
            const order: SetType[] = ["working", "warmup", "drop", "failure"];
            const next = order[(order.indexOf(set.setType) + 1) % order.length]!;
            onChange({ setType: next });
          }}
        >
          {typeLabel || "WK"}
        </button>
        <button
          type="button"
          onClick={onToggle}
          onContextMenu={(event) => {
            event.preventDefault();
            onDelete();
          }}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl hairline",
            set.isCompleted ? "bg-success text-canvas" : "bg-surface text-muted",
          )}
          aria-label={set.isCompleted ? "Mark incomplete" : "Complete set"}
        >
          <Check className="size-4" />
        </button>
      </div>
      {showReps ? (
        <div className="mt-2 flex items-center gap-2 pl-8">
          <Stepper
            value={reps}
            placeholder={ghost?.reps != null ? String(ghost.reps) : "0"}
            ariaLabel={`Set ${number}${set.side ? ` ${set.side}` : ""} reps`}
            inputMode="numeric"
            onMinus={() => onNudgeReps(-1)}
            onPlus={() => onNudgeReps(1)}
            onChange={(value) => {
              setReps(value);
              onChange({ reps: parseRepsInput(value) });
            }}
            onEnter={onToggle}
          />
          {intensityMode !== "none" ? (
            <button
              type="button"
              className="h-11 shrink-0 rounded-xl bg-surface px-3 text-xs text-muted hairline"
              aria-label={`Set ${number}${set.side ? ` ${set.side}` : ""} ${intensityMode === "rir" ? "reps in reserve" : "RPE"}`}
              onClick={() => setPickingIntensity(true)}
            >
              {intensityLabel(intensityMode, set)}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-1 flex items-center gap-1 pl-8">
        <button
          type="button"
          className="grid size-9 place-items-center rounded-lg text-subtle hover:bg-surface"
          aria-label="Set grind"
          onClick={() => {
            const current = set.grind ?? "normal";
            const next = grindOrder[(grindOrder.indexOf(current) + 1) % grindOrder.length]!;
            onChange({ grind: next });
          }}
        >
          <Flame
            className={cn(
              "size-3.5",
              set.grind === "grind" && "text-accent",
              set.grind === "easy" && "text-success",
            )}
          />
        </button>
        <button
          type="button"
          className="grid size-9 place-items-center rounded-lg text-subtle hover:bg-surface"
          aria-label="Attach clip"
          onClick={() => fileRef.current?.click()}
        >
          <Video className={cn("size-3.5", set.clipId && "text-accent")} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onClip(file);
            event.target.value = "";
          }}
        />
        <p className="min-w-0 flex-1 text-[11px] text-subtle">
          {cmp
            ? cmp.verdict === "beat"
              ? `Beat ghost · ${cmp.label}`
              : cmp.verdict === "behind"
                ? `Ghost won · ${cmp.label}`
                : cmp.label
            : classification === "hit"
              ? "In range"
              : classification === "under"
                ? "Under range"
                : classification === "over"
                  ? "Over range"
                  : ghost
                    ? `Ghost ${formatGhostSet(ghost, unit)}`
                    : set.grind
                      ? set.grind
                      : "Long-press check to delete"}
        </p>
      </div>
      <Sheet
        open={pickingIntensity}
        onClose={() => setPickingIntensity(false)}
        title={intensityMode === "rir" ? "Reps in reserve" : "RPE"}
        description={
          intensityMode === "rir"
            ? "How many more reps you could have done. Tap the chosen value again to clear it."
            : "How hard the set felt, 10 being no reps left. Tap the chosen value again to clear it."
        }
      >
        <div className="grid grid-cols-3 gap-2">
          {intensityChoices(intensityMode).map((choice) => (
            <button
              key={choice}
              type="button"
              className={cn(
                "h-14 rounded-xl text-lg font-medium tabular hairline",
                intensityValue(intensityMode, set) === choice
                  ? "bg-accent text-canvas"
                  : "bg-raised text-ink",
              )}
              onClick={() => {
                onChange(intensityPatch(intensityMode, set, choice));
                setPickingIntensity(false);
              }}
            >
              {choice}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function Stepper({
  value,
  placeholder,
  ariaLabel,
  inputMode = "decimal",
  onMinus,
  onPlus,
  onChange,
  onEnter,
}: {
  value: string;
  placeholder: string;
  ariaLabel: string;
  inputMode?: "decimal" | "numeric";
  onMinus: () => void;
  onPlus: () => void;
  onChange: (value: string) => void;
  onEnter?: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <button
        type="button"
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface text-muted hairline"
        onClick={onMinus}
        aria-label={`Decrease ${ariaLabel}`}
      >
        <Minus className="size-3.5" />
      </button>
      <Input
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        className="h-11 px-1 text-center font-mono text-base"
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onEnter?.();
        }}
      />
      <button
        type="button"
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface text-muted hairline"
        onClick={onPlus}
        aria-label={`Increase ${ariaLabel}`}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
