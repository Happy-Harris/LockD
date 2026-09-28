import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { MomentPoster } from "@/components/app/moment-poster";
import { downloadReceiptPng, SessionReceipt } from "@/components/app/receipt";
import { Page } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { elapsedSeconds } from "@/domain/time";
import { weightUnitFor } from "@/domain/units";
import { detectPrsForWorkout, workoutTonnageG } from "@/lib/gym/analytics";
import { workoutDiff } from "@/lib/gym/ghost";
import { momentsForWorkout } from "@/lib/gym/moments";
import { nearMisses } from "@/lib/gym/queue";
import { useGymDerived, useSlices } from "@/lib/gym/hooks";
import { useGym } from "@/lib/gym/store";
import { PublishButton } from "@/components/app/publish-button";
import { receiptShare } from "@/lib/cloud/shares";

export const Route = createFileRoute("/workout_/$id/summary")({ component: SummaryPage });

function SummaryPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const slices = useSlices();
  const { records, chronicle, settings, queue } = useGymDerived();
  const saveTemplateFromWorkout = useGym((s) => s.saveTemplateFromWorkout);
  const pinLesson = useGym((s) => s.pinLesson);
  const slice = slices.find((row) => row.workout.id === id);
  const unit = weightUnitFor(settings.unitSystem);
  const [saved, setSaved] = useState(false);
  const [lesson, setLesson] = useState("");
  const receiptRef = useRef<HTMLDivElement>(null);

  const diff = useMemo(() => (slice ? workoutDiff(slice, slices, unit) : null), [slice, slices, unit]);
  const misses = useMemo(
    () =>
      slice
        ? nearMisses({
            slice,
            slices,
            formula: settings.oneRepMaxFormula,
            excludeWarmups: settings.excludeWarmupsFromAnalytics,
            incrementG: settings.quickIncrementG,
            unit,
          })
        : [],
    [slice, slices, settings, unit],
  );

  if (!slice) {
    return (
      <Page>
        <p className="text-sm text-muted">That session is not on file.</p>
        <Button className="mt-4" onClick={() => void navigate({ to: "/" })}>
          Today
        </Button>
      </Page>
    );
  }

  const prs = detectPrsForWorkout(id, slices, settings.oneRepMaxFormula);
  const duration = elapsedSeconds(slice.workout.startedAt, slice.workout.endedAt, slice.workout.pausedSeconds);
  const tonnage = workoutTonnageG(slice, true);
  const sessionMoments = momentsForWorkout(id, slices, records, chronicle.eras);
  const firstExercise = slice.exercises[0];

  return (
    <Page>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Logged</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Keep the receipt.</h1>
      <p className="mt-1 text-sm text-muted">The session is on the locker. Send the paper copy as a link, or keep a PNG.</p>

      {diff ? (
        <Card className="mt-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Workout diff</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">{diff.headline}</h2>
          {diff.ghost ? (
            <p className="mt-1 text-xs text-muted">
              vs {diff.ghost.name} · {diff.ghost.date} · {diff.score.beat} beat · {diff.score.tie} tie · {diff.score.behind} behind
            </p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {diff.lines.map((line) => (
              <li key={line.exerciseId} className="flex items-start justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">{line.exerciseName}</span>
                  <span className="mt-0.5 block text-xs text-muted">{line.summary}</span>
                </span>
                <Badge
                  tone={
                    line.verdict === "beat" ? "success" : line.verdict === "behind" ? "warning" : "muted"
                  }
                >
                  {line.verdict}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {misses.length > 0 ? (
        <section className="mt-5">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Near misses</h2>
          <div className="mt-3 space-y-2">
            {misses.map((row) => (
              <Card key={row.id}>
                <p className="text-sm font-medium">{row.name}</p>
                <p className="mt-1 text-sm text-muted">{row.miss}</p>
                <p className="mt-1 font-mono text-xs text-subtle">
                  {row.setLabel} → {row.wouldHaveBeen}
                </p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {queue.length > 0 ? (
        <section className="mt-5">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Milestone queue</h2>
          <div className="mt-3 space-y-2">
            {queue.slice(0, 3).map((row) => (
              <Card key={row.id}>
                <p className="text-sm font-medium">{row.name}</p>
                <p className="mt-1 text-sm text-muted">{row.how}</p>
                <p className="mt-1 font-mono text-xs text-subtle">
                  {row.current} → {row.target}
                </p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {sessionMoments.length > 0 ? (
        <div className="mt-6 space-y-4">
          {sessionMoments.slice(0, 2).map((moment) => (
            <Link key={moment.id} to="/moments/$id" params={{ id: moment.id }}>
              <MomentPoster moment={moment} unit={unit} />
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-6" ref={receiptRef}>
        <SessionReceipt slice={slice} prs={prs} unit={unit} duration={duration} tonnage={tonnage} />
      </div>

      {firstExercise ? (
        <form
          className="mt-6 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            pinLesson(firstExercise.exerciseId, lesson, id);
            setLesson("");
          }}
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Pin a lesson</p>
          <Input
            value={lesson}
            onChange={(event) => setLesson(event.target.value)}
            placeholder="70 kg was too aggressive after 3×10"
          />
          <Button type="submit" variant="secondary" className="w-full" disabled={!lesson.trim()}>
            Save to {firstExercise.exerciseNameSnapshot}
          </Button>
        </form>
      ) : null}

      <div className="mt-6 space-y-2">
        <PublishButton
          kind="receipt"
          title={slice.workout.name}
          payload={receiptShare(slice, prs, unit, duration, tonnage, chronicle.current?.name)}
          label="Share session link"
        />
        <Button
          className="w-full"
          variant="secondary"
          onClick={() => {
            if (receiptRef.current) {
              downloadReceiptPng(receiptRef.current, `lockd-${slice.workout.localDate}.png`);
            }
          }}
        >
          Download receipt
        </Button>
        <Button
          className="w-full"
          variant="secondary"
          disabled={saved}
          onClick={() => {
            saveTemplateFromWorkout(id, slice.workout.name);
            setSaved(true);
          }}
        >
          {saved ? "Saved as routine" : "Save as routine"}
        </Button>
        <Button className="w-full" asChild>
          <Link to="/">Back to Today</Link>
        </Button>
      </div>
    </Page>
  );
}
