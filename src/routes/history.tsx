import { createFileRoute, Link } from "@tanstack/react-router";
import { Page } from "@/components/app/shell";
import { Card } from "@/components/ui/card";
import { formatLocalDate } from "@/domain/time";
import { formatDuration, formatWeightWithUnit, weightUnitFor } from "@/domain/units";
import { elapsedSeconds } from "@/domain/time";
import { workoutTonnageG } from "@/lib/gym/analytics";
import { useGymDerived } from "@/lib/gym/hooks";
import { hardSetCount } from "@/domain/volume";

export const Route = createFileRoute("/history")({ component: HistoryPage });

function HistoryPage() {
  const { slices, settings } = useGymDerived();
  const unit = weightUnitFor(settings.unitSystem);
  const newestFirst = [...slices].reverse();

  const grouped = new Map<string, typeof newestFirst>();
  for (const slice of newestFirst) {
    const key = slice.workout.localDate.slice(0, 7);
    const list = grouped.get(key) ?? [];
    list.push(slice);
    grouped.set(key, list);
  }

  return (
    <Page>
      <h1 className="font-display text-4xl font-semibold tracking-tight">History</h1>
      <p className="mt-1 text-sm text-muted">{slices.length} completed sessions on file.</p>
      <div className="mt-6 space-y-6">
        {[...grouped.entries()].map(([month, list]) => (
          <section key={month}>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-subtle">{month}</h2>
            <div className="space-y-2">
              {list.map((slice) => (
                <Link key={slice.workout.id} to="/history/$id" params={{ id: slice.workout.id }}>
                  <Card className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{slice.workout.name}</p>
                      <p className="text-xs text-muted">
                        {formatLocalDate(slice.workout.localDate)} · {hardSetCount(slice.sets)} sets ·{" "}
                        {formatDuration(
                          elapsedSeconds(slice.workout.startedAt, slice.workout.endedAt, slice.workout.pausedSeconds),
                        )}
                      </p>
                    </div>
                    <p className="text-sm tabular text-muted">
                      {formatWeightWithUnit(workoutTonnageG(slice, true), unit)}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
      {slices.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted">Nothing logged yet. Finish a session and it lands here.</p>
      ) : null}
    </Page>
  );
}
