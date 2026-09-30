import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { formatLocalDate } from "@/domain/time";
import type { ComebackRule } from "@/domain/types";
import { formatWeightWithUnit, type WeightUnit } from "@/domain/units";
import { comebackRuleLine, type ComebackState } from "@/lib/gym/comeback";
import type { ProgressionCall } from "@/lib/gym/progression";

const day = (date: string) => formatLocalDate(date, { day: "numeric", month: "short", year: "numeric" });

/**
 * Opp 8 on Today: while the lifter is away, what the next session of each lift starts at and where
 * that comes from; once back, the records set since the return. Every number cites its session.
 */
export function ComebackCard({
  comeback,
  calls,
  unit,
  rule,
}: {
  comeback: ComebackState;
  calls: ProgressionCall[];
  unit: WeightUnit;
  rule?: ComebackRule;
}) {
  const restarts = calls.filter((call) => call.action === "re_entry").slice(0, 4);
  return (
    <Card className="mb-5" data-testid="comeback-card">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Comeback</p>
      {comeback.phase === "away" ? (
        <p className="mt-2 font-display text-2xl font-semibold tracking-tight">
          {comeback.daysAway} days since your last session, on {day(comeback.lastDate)}.
        </p>
      ) : (
        <>
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight">
            Back on {day(comeback.returnDate)} after {comeback.daysAway} days away.
          </p>
          <p className="mt-2 text-sm text-muted" data-testid="comeback-prs">
            {comeback.prs.length === 0
              ? `No estimated-1RM records since then, across ${comeback.sessionsSince} ${comeback.sessionsSince === 1 ? "session" : "sessions"}.`
              : `${comeback.prs.length} estimated-1RM ${comeback.prs.length === 1 ? "record" : "records"} since then: ${comeback.prs
                  .map((row) => `${row.exerciseName} on ${day(row.date)}`)
                  .join(", ")}.`}
          </p>
        </>
      )}

      {restarts.length ? (
        <ul className="mt-3 space-y-2" data-testid="comeback-restarts">
          {restarts.map((call) => (
            <li key={call.exerciseId} className="text-sm">
              <span className="font-medium">{call.exerciseName}</span>{" "}
              <span className="font-mono tabular">
                {call.suggestedWeightG ? formatWeightWithUnit(call.suggestedWeightG, unit) : "body weight"}
                {call.suggestedReps != null ? ` × ${call.suggestedReps}` : ""}
              </span>
              {call.lastWeightG && call.lastDate ? (
                <span className="text-muted">
                  , from {formatWeightWithUnit(call.lastWeightG, unit)} on {day(call.lastDate)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 text-xs leading-relaxed text-subtle">
        {comebackRuleLine(rule)}{" "}
        <Link to="/settings" hash="comeback" className="underline underline-offset-2">
          Change it in Settings
        </Link>
        .
      </p>
    </Card>
  );
}
