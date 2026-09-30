import { formatLocalDate } from "@/domain/time";
import { formatDurationLong, type WeightUnit } from "@/domain/units";
import { useState } from "react";
import { getHistoryView } from "@/lib/cloud/api";
import { setLabel, type HistorySession, type HistoryView } from "@/lib/cloud/history-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const day = (date: string) => formatLocalDate(date, { day: "numeric", month: "short", year: "numeric" });

/** The read-only log a history link shows (Opp 9): sessions newest first, every completed set as logged. */
export function HistorySessionCard({ session, unit }: { session: HistorySession; unit: WeightUnit }) {
  return (
    <Card data-testid="history-session">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">{session.name}</p>
        <p className="font-mono text-[11px] text-subtle">
          {formatLocalDate(session.date, { day: "numeric", month: "short", year: "numeric" })}
        </p>
      </div>
      {session.durationSec ? <p className="mt-0.5 text-xs text-subtle">{formatDurationLong(session.durationSec)}</p> : null}
      <ul className="mt-3 space-y-2">
        {session.exercises.map((exercise, index) => (
          <li key={`${exercise.name}-${index}`} className="text-sm">
            <span className="font-medium">{exercise.name}</span>
            <span className="block font-mono text-xs leading-relaxed text-muted tabular">
              {exercise.sets.map((set, setIndex) => (
                <span key={setIndex} className="whitespace-nowrap">
                  {setIndex > 0 ? " · " : ""}
                  {setLabel(set, unit)}{" "}
                </span>
              ))}
            </span>
          </li>
        ))}
        {session.exercises.length === 0 ? <li className="text-sm text-muted">No completed sets.</li> : null}
      </ul>
    </Card>
  );
}

/** The page a history link opens: a summary line, then the sessions, with older ones a page at a time. */
export function HistoryLinkBody({ view, token }: { view: HistoryView; token: string }) {
  const [more, setMore] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sessions = [...view.sessions, ...more];
  const loadMore = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const next = await getHistoryView({ data: { token, offset: sessions.length } });
      if (next.ok) setMore((current) => [...current, ...next.view.sessions]);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">A training log, shared read-only.</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted" data-testid="history-summary">
        {view.totalSessions === 0
          ? "No completed sessions yet."
          : `${view.totalSessions} ${view.totalSessions === 1 ? "session" : "sessions"}, ${day(view.firstDate!)} to ${day(view.lastDate!)}. Every completed set as it was logged, in ${view.unit}.`}
      </p>
      <p className="mt-1 text-xs text-subtle">
        The lifter shared this link and can revoke it at any time. It shows sessions and sets only: no name, notes,
        bodyweight or videos. W is a warm-up set, D a drop set, F a set to failure.
      </p>
      <div className="mt-6 space-y-2">
        {sessions.map((session, index) => (
          <HistorySessionCard key={`${session.date}-${index}`} session={session} unit={view.unit} />
        ))}
      </div>
      {sessions.length < view.totalSessions ? (
        <Button className="mt-4 w-full" variant="secondary" disabled={loading} onClick={() => void loadMore()}>
          {loading ? "Loading…" : `Show older sessions (${view.totalSessions - sessions.length} more)`}
        </Button>
      ) : null}
      {failed ? <p className="mt-2 text-sm text-muted">Could not load more. The link may have been revoked.</p> : null}
    </>
  );
}
