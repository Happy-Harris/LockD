import { Link } from "@tanstack/react-router";
import { formatLocalDate } from "@/domain/time";
import type { ProgressionCite } from "@/lib/gym/progression";

/**
 * Opp 3: the sessions a progression call read, each one a link to that session in History, so the
 * "why" can be checked against the log. Renders nothing when the call read no session.
 */
export function CitedSessions({ cites, lift }: { cites: ProgressionCite[]; lift: string }) {
  if (cites.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1" data-testid="cited-sessions">
      <span className="text-xs text-subtle">
        {cites.length === 1 ? "Read from" : `Read from ${cites.length} sessions:`}
      </span>
      {cites.map((cite) => (
        <Link
          key={cite.workoutId}
          to="/history/$id"
          params={{ id: cite.workoutId }}
          aria-label={`Open the ${lift} session on ${formatLocalDate(cite.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
          className="inline-flex min-h-11 items-center rounded-lg px-2 font-mono text-xs text-accent underline-offset-2 hover:underline"
        >
          {formatLocalDate(cite.date, { day: "numeric", month: "short", year: "numeric" })}
        </Link>
      ))}
    </div>
  );
}
