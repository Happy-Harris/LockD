import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Play, RotateCcw } from "lucide-react";
import { ComebackCard } from "@/components/app/comeback-card";
import { Page } from "@/components/app/shell";
import { WeeklyVerdictCard } from "@/components/app/weekly-verdict-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatLocalDate, todayHeader } from "@/domain/time";
import type { GoalLens } from "@/domain/types";
import { titleCase } from "@/domain/taxonomy";
import { formatWeight, formatWeightWithUnit, roundEstimateG, weightUnitFor } from "@/domain/units";
import { e1rmSeries } from "@/lib/gym/analytics";
import { useStartProgramSession } from "@/lib/gym/program-hooks";
import { LENSES, lensShows } from "@/lib/gym/lenses";
import { formatSets, stateLabel } from "@/lib/gym/muscle-labels";
import { actionLabel } from "@/lib/gym/progression";
import { lastTrainedLabel, muscleLastTrained } from "@/lib/gym/recovery";
import { useGymDerived } from "@/lib/gym/hooks";
import { useGym } from "@/lib/gym/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: TodayPage });

function TodayPage() {
  const navigate = useNavigate();
  const startFromTemplate = useGym((s) => s.startFromTemplate);
  const startEmptyWorkout = useGym((s) => s.startEmptyWorkout);
  const repeatLastWorkout = useGym((s) => s.repeatLastWorkout);
  const startFromProgramSession = useStartProgramSession();
  const updateSettings = useGym((s) => s.updateSettings);
  const activeId = useGym((s) => s.workouts.find((row) => row.status === "active")?.id);
  const derived = useGymDerived();
  const {
    verdict,
    verdictLens,
    muscleInsights,
    subjectBalance,
    heat,
    streak,
    nextTemplate,
    records,
    lastCompleted,
    settings,
    templates,
    templateExercises,
    slices,
    lens,
    board,
    easier,
    comeback,
    chronicle,
    moments,
    intelligence,
    activeProgram,
    nextProgram,
    activeWeek,
    exercises,
    queue,
    autopsies,
    dna,
  } = derived;
  const unit = weightUnitFor(settings.unitSystem);
  const today = todayHeader();
  const lastTrained = muscleLastTrained(slices);
  const startRoutine = (templateId: string) => {
    startFromTemplate(templateId);
    void navigate({ to: "/workout" });
  };
  const visibleRoutines = templates.filter((row) => !row.isArchived).slice(0, 4);
  const notableFirsts = moments.filter((row) => row.kind === "first");
  const featuredFirsts = notableFirsts.filter((row) => row.featured);
  const firsts = (featuredFirsts.length ? featuredFirsts : notableFirsts).slice(0, 2);
  const currentEra = chronicle.current;

  const goalCards = settings.goalLiftIds.map((id) => {
    const exercise = exercises.find((row) => row.id === id);
    const series = e1rmSeries(id, slices, settings.oneRepMaxFormula);
    const latest = series[series.length - 1];
    const call = board.find((row) => row.exerciseId === id);
    return { id, name: exercise?.name ?? "Lift", latest, call };
  });

  const skillCards = lens.skillIds.map((id) => {
    const exercise = exercises.find((row) => row.id === id);
    const call = board.find((row) => row.exerciseId === id);
    return { id, name: exercise?.name ?? "Skill", call };
  });

  return (
    <Page>
      <header className="mb-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">{today}</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-5xl font-semibold tracking-tight text-ink">Today</h1>
            <p className="mt-1 text-sm text-muted">
              {currentEra ? `${currentEra.name}` : "No era yet"}
              {slices.length > 0 ? ` · ${slices.length} sessions` : ""}
              {streak > 0 ? ` · ${streak}-day streak` : ""}
            </p>
          </div>
          <p className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-subtle sm:block">
            ⌘K
          </p>
        </div>
        <div className="lens-row -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
          {LENSES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => updateSettings({ goalLens: item.id as GoalLens })}
              className={cn(
                "lens-chip h-9 shrink-0 rounded-full px-3 text-xs font-medium",
                settings.goalLens === item.id
                  ? "bg-accent text-accent-ink"
                  : "bg-raised text-muted hairline",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">{lens.blurb}</p>
      </header>

      {activeId ? (
        <Link
          to="/workout"
          className="mb-5 flex items-center justify-between rounded-2xl bg-accent px-4 py-4 text-accent-ink"
        >
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] opacity-80">
              In progress
            </p>
            <p className="font-display text-2xl font-semibold tracking-tight">Resume session</p>
          </div>
          <Play className="size-5" />
        </Link>
      ) : null}

      {easier.needed ? (
        <Card className="mb-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-warning">
            Easier week
          </p>
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight">
            The engine is calling it.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{easier.why}</p>
        </Card>
      ) : null}

      {comeback ? (
        <ComebackCard comeback={comeback} calls={board} unit={unit} rule={settings.comebackRule} />
      ) : null}

      {autopsies.some((row) => row.stalled) ? (
        <Link to="/lab" className="mb-5 block">
          <Card>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-warning">
              Plateau autopsy
            </p>
            <p className="mt-2 font-display text-2xl font-semibold tracking-tight">
              {autopsies.find((row) => row.stalled)?.name} is stalling.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {autopsies.find((row) => row.stalled)?.headline}
            </p>
          </Card>
        </Link>
      ) : null}

      {lensShows(settings.goalLens, "verdict") ? (
        <div className="mb-6">
          <WeeklyVerdictCard
            verdict={verdict}
            weightUnit={unit}
            lens={verdictLens}
            lensLabel={lens.label}
            stamp
            muscleBalance={subjectBalance}
            exercises={exercises}
            goalLiftIds={settings.goalLiftIds}
            onGoalLiftIdsChange={(goalLiftIds) => updateSettings({ goalLiftIds })}
            lensId={settings.goalLens}
            onLensChange={(goalLens) => updateSettings({ goalLens })}
          />
        </div>
      ) : null}

      {queue.length > 0 ? (
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold tracking-tight">Within reach</h2>
            <Link to="/lab" className="text-sm text-muted hover:text-ink">
              Queue
            </Link>
          </div>
          <div className="space-y-2">
            {queue.slice(0, 3).map((row) => (
              <Link key={row.id} to="/library/$id" params={{ id: row.exerciseId }}>
                <Card>
                  <p className="text-sm font-medium">{row.name}</p>
                  <p className="mt-1 text-sm text-muted">{row.how}</p>
                  <p className="mt-1 font-mono text-xs text-subtle">
                    {row.current} → {row.target}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {lensShows(settings.goalLens, "goals") && goalCards.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight">Goal lifts</h2>
          <div className="grid grid-cols-1 gap-2">
            {goalCards.map((card) => (
              <Link key={card.id} to="/library/$id" params={{ id: card.id }}>
                <Card className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{card.name}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-subtle">
                      Est. 1RM
                    </p>
                    <p className="font-display text-3xl font-semibold tabular">
                      {card.latest
                        ? formatWeightWithUnit(roundEstimateG(card.latest.value, unit), unit)
                        : "—"}
                    </p>
                    {card.latest ? (
                      <p className="text-[11px] text-subtle">
                        from {formatWeight(card.latest.source.weightG, unit)} {unit} ×{" "}
                        {card.latest.source.reps}, {formatLocalDate(card.latest.date)}
                      </p>
                    ) : null}
                    {card.call ? <p className="mt-1 text-xs text-muted">{card.call.why}</p> : null}
                    {dna.find((row) => row.exerciseId === card.id)?.personality ? (
                      <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-subtle">
                        {dna.find((row) => row.exerciseId === card.id)?.personality}
                      </p>
                    ) : null}
                  </div>
                  {card.call ? <Badge tone="accent">{actionLabel(card.call.action)}</Badge> : null}
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {lensShows(settings.goalLens, "skills") && skillCards.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight">Skills</h2>
          <div className="grid grid-cols-2 gap-2">
            {skillCards.map((card) => (
              <Link key={card.id} to="/library/$id" params={{ id: card.id }}>
                <Card>
                  <p className="text-xs text-muted">{card.name}</p>
                  <p className="mt-1 font-display text-xl font-semibold">
                    {card.call ? actionLabel(card.call.action) : "—"}
                  </p>
                  <p className="mt-1 text-[11px] text-subtle">
                    {card.call?.why ?? "No history yet."}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {lensShows(settings.goalLens, "relative") && intelligence.relative.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 font-display text-2xl font-semibold tracking-tight">
            Strength / bodyweight
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {intelligence.relative.map((row) => (
              <Card key={row.exerciseId} className="p-3">
                <p className="text-xs text-muted">{row.name}</p>
                <p className="mt-1 font-display text-2xl font-semibold tabular">
                  {row.ratio.toFixed(2)}×
                </p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {lensShows(settings.goalLens, "progression") ? (
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold tracking-tight">Next targets</h2>
            <Link to="/lab" className="text-sm text-muted hover:text-ink">
              Why
            </Link>
          </div>
          <div className="space-y-2">
            {board.slice(0, 4).map((call) => (
              <Card key={call.exerciseId}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{call.exerciseName}</p>
                    <p className="mt-1 font-mono text-xs tabular text-muted">
                      {call.suggestedWeightG
                        ? `${formatWeight(call.suggestedWeightG, unit)} ${unit}`
                        : "—"}
                      {call.suggestedReps != null ? ` × ${call.suggestedReps}` : ""}
                    </p>
                  </div>
                  <Badge
                    tone={
                      call.action === "easier_week" || call.action === "deload"
                        ? "warning"
                        : "muted"
                    }
                  >
                    {actionLabel(call.action)}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{call.why}</p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Start</h2>
          <Link to="/routines" className="shrink-0 text-sm text-muted hover:text-ink">
            Train
          </Link>
        </div>
        {activeProgram?.completedAt ? (
          <Link
            to="/programs/$id"
            params={{ id: activeProgram.id }}
            className="mb-3 block rounded-[28px] bg-raised px-4 py-5 hairline"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
              {activeProgram.name}
            </p>
            <p className="mt-1 font-display text-3xl font-semibold tracking-tight">Program complete</p>
            <p className="text-sm text-muted">Restart the block or choose another.</p>
          </Link>
        ) : activeProgram && nextProgram ? (
          <button
            type="button"
            onClick={() => {
              startFromProgramSession(activeProgram.id, nextProgram.id);
              void navigate({ to: "/workout" });
            }}
            className="mb-3 flex w-full items-center justify-between rounded-[28px] bg-raised px-4 py-5 text-left hairline"
          >
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
                {activeProgram.name} · week {activeProgram.currentWeek}
                {activeWeek?.isDeload ? " · deload" : ""}
              </p>
              <p className="mt-1 font-display text-3xl font-semibold tracking-tight">
                {nextProgram.name}
              </p>
              <p className="text-sm text-muted">Progression rules already applied to the loads.</p>
            </div>
            <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-ink">
              <Play className="size-4" />
            </span>
          </button>
        ) : nextTemplate ? (
          <button
            type="button"
            onClick={() => startRoutine(nextTemplate.id)}
            className="mb-3 flex w-full items-center justify-between rounded-[28px] bg-raised px-4 py-5 text-left hairline"
          >
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
                Suggested next
              </p>
              <p className="mt-1 font-display text-3xl font-semibold tracking-tight">
                {nextTemplate.name}
              </p>
              <p className="text-sm text-muted">
                {templateExercises.filter((row) => row.templateId === nextTemplate.id).length} lifts
              </p>
            </div>
            <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-ink">
              <Play className="size-4" />
            </span>
          </button>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              const id = repeatLastWorkout();
              if (id) void navigate({ to: "/workout" });
            }}
            disabled={!lastCompleted}
          >
            <RotateCcw className="size-4" />
            Repeat last
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              startEmptyWorkout();
              void navigate({ to: "/workout" });
            }}
          >
            Empty session
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {visibleRoutines.map((routine) => (
            <button
              key={routine.id}
              type="button"
              onClick={() => startRoutine(routine.id)}
              className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-surface px-4 text-left hairline"
            >
              <span>
                <span className="block text-sm font-medium text-ink">{routine.name}</span>
                <span className="block text-xs text-muted">
                  {templateExercises.filter((row) => row.templateId === routine.id).length}{" "}
                  exercises
                </span>
              </span>
              <ArrowRight className="size-4 text-subtle" />
            </button>
          ))}
        </div>
      </section>

      {lensShows(settings.goalLens, "recovery") ? (
        <section className="mb-6" data-testid="today-last-trained">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold tracking-tight">Last trained</h2>
            <Link to="/lab" className="text-sm text-muted hover:text-ink">
              The Lab
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {lastTrained.map((row) => (
              <div key={row.muscle} className="rounded-2xl bg-surface p-3 hairline">
                <p className="text-xs text-muted">{titleCase(row.muscle)}</p>
                <p className="mt-1 text-sm font-medium text-ink">{lastTrainedLabel(row.daysAgo)}</p>
                <p className="mt-1 text-[10px] text-subtle">
                  {row.lastDate ? formatLocalDate(row.lastDate) : "\u00a0"}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {lensShows(settings.goalLens, "volume") ? (
        <section className="mb-6" data-testid="today-volume">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              This week’s volume
            </h2>
            <Link to="/analytics" className="text-sm text-muted hover:text-ink">
              Data Lab
            </Link>
          </div>
          {muscleInsights.length === 0 ? (
            <p className="text-sm text-muted">No completed working sets this week yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {muscleInsights.slice(0, 6).map((row) => (
                <div key={row.muscle} className="rounded-2xl bg-surface p-3 hairline">
                  <p className="text-xs text-muted">{titleCase(row.muscle)}</p>
                  <p className="mt-1 font-display text-lg font-semibold tabular">
                    {formatSets(row.sets)}
                  </p>
                  <p className="text-[10px] text-subtle">
                    {row.target
                      ? `of ${formatSets(row.target.min)}–${formatSets(row.target.max)} · `
                      : ""}
                    {stateLabel(row)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {lensShows(settings.goalLens, "moments") || firsts.length > 0 ? (
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold tracking-tight">Moments</h2>
            <Link to="/chronicle" className="text-sm text-muted hover:text-ink">
              Chronicle
            </Link>
          </div>
          <div className="space-y-2">
            {(firsts.length ? firsts : moments.filter((row) => row.kind === "pr").slice(0, 3)).map(
              (moment) => (
                <Link key={moment.id} to="/moments/$id" params={{ id: moment.id }}>
                  <Card className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-subtle">
                        {moment.kicker}
                      </p>
                      <p className="mt-1 text-sm font-medium">{moment.title}</p>
                    </div>
                    <Badge tone="accent">{moment.kind === "first" ? "First" : "PR"}</Badge>
                  </Card>
                </Link>
              ),
            )}
          </div>
        </section>
      ) : null}

      <Card className="mb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
          Last 12 weeks
        </p>
        <div className="mt-3 grid grid-flow-col grid-rows-7 gap-1">
          {heat.map((day) => {
            const level =
              day.sessions === 0 ? 0 : day.sessions === 1 ? 2 : Math.min(4, day.sessions + 1);
            return (
              <div
                key={day.date}
                title={`${day.date}: ${day.sessions} session${day.sessions === 1 ? "" : "s"}`}
                className={`heat-${level} size-3 rounded-[3px]`}
              />
            );
          })}
        </div>
      </Card>

      {lastCompleted ? (
        <p className="text-xs text-subtle">
          Last session: {lastCompleted.workout.name} on{" "}
          {formatLocalDate(lastCompleted.workout.localDate)}.
        </p>
      ) : null}
    </Page>
  );
}
