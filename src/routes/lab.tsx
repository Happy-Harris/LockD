import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Page } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AskLab } from "@/components/app/ask-lab";
import { Card, Stat } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { consultLab } from "@/lib/lab/ask";
import { actionLabel } from "@/lib/gym/progression";
import { useGymDerived } from "@/lib/gym/hooks";
import { useGym } from "@/lib/gym/store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listLabNotes } from "@/lib/cloud/api";
import type { LabHistoryNote } from "@/lib/cloud/types";

export const Route = createFileRoute("/lab")({ component: LabPage });

function LabPage() {
  const { intelligence, board, easier, chronicle, autopsies, dna, queue } = useGymDerived();
  const labLast = useGym((s) => s.labLast);
  const setLabLast = useGym((s) => s.setLabLast);
  const { user, isPending } = useCurrentUserState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<LabHistoryNote[]>([]);

  useEffect(() => {
    if (!user) return;
    void listLabNotes()
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [user]);

  const ask = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const result = await consultLab({ data: { question } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLabLast(result.text);
      setHistory((current) => [
        { id: result.id, question, answer: result.text, createdAt: result.askedAt },
        ...current,
      ]);
      setQuestion("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">The Lab</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Ask the numbers.</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Everything here is worked out on this device from your log, and every answer cites what it used. Signed in, you
        can also ask the Lab for a written second opinion: it reads your synced log and files the answer.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-2">
        <Card className="p-3">
          <Stat label="Hit rate" value={`${Math.round(intelligence.hitRate * 100)}%`} />
        </Card>
        <Card className="p-3">
          <Stat label="Easier week" value={easier.needed ? "Yes" : "No"} />
        </Card>
        <Card className="p-3">
          <Stat label="Era" value={chronicle.current?.name ?? "—"} />
        </Card>
      </div>

      <AskLab />

      {autopsies.filter((row) => row.stalled).length > 0 ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Plateau autopsy</h2>
          <div className="mt-3 space-y-2">
            {autopsies
              .filter((row) => row.stalled)
              .map((row) => (
                <Link key={row.exerciseId} to="/library/$id" params={{ id: row.exerciseId }}>
                  <Card>
                    <p className="text-sm font-medium">{row.name}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{row.headline}</p>
                    {row.findings[0] ? (
                      <p className="mt-2 font-mono text-[11px] text-subtle">{row.findings[0].evidence}</p>
                    ) : null}
                  </Card>
                </Link>
              ))}
          </div>
        </section>
      ) : null}

      {queue.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Milestone queue</h2>
          <div className="mt-3 space-y-2">
            {queue.slice(0, 5).map((row) => (
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

      {dna.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Lift DNA</h2>
          <div className="mt-3 space-y-2">
            {dna.map((row) => (
              <Link key={row.exerciseId} to="/library/$id" params={{ id: row.exerciseId }}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{row.name}</p>
                    <Badge tone="muted">{row.personality}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted">{row.personalityWhy}</p>
                  <p className="mt-1 font-mono text-xs text-subtle">
                    {row.exposures} exposures
                    {row.strongestRange ? ` · ${row.strongestRange}` : ""}
                    {row.bestWeekday ? ` · ${row.bestWeekday}` : ""}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {intelligence.insights.length ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight">On file</h2>
          <ul className="mt-3 space-y-2">
            {intelligence.insights.map((line) => (
              <li key={line} className="rounded-2xl bg-surface px-4 py-3 text-sm leading-relaxed text-ink hairline">
                {line}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {intelligence.exposuresToProgress.length ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Exposures to progress</h2>
          <div className="mt-3 space-y-2">
            {intelligence.exposuresToProgress.map((row) => (
              <Card key={row.exerciseId} className="flex items-center justify-between">
                <p className="text-sm">{row.name}</p>
                <p className="font-mono text-sm tabular">usually {row.typical}</p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {intelligence.fatigue.length ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Fatigue patterns</h2>
          <div className="mt-3 space-y-2">
            {intelligence.fatigue.map((row) => (
              <Card key={row.name}>
                <p className="text-sm leading-relaxed">{row.note}</p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {intelligence.relative.length ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Relative strength</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {intelligence.relative.map((row) => (
              <Card key={row.exerciseId} className="p-3">
                <p className="text-xs text-muted">{row.name}</p>
                <p className="mt-1 font-display text-2xl font-semibold tabular">{row.ratio.toFixed(2)}×</p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {intelligence.leftRight.length ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Left / right</h2>
          <div className="mt-3 space-y-2">
            {intelligence.leftRight.map((row) => (
              <Card key={row.metric} className="flex items-center justify-between">
                <p className="text-sm">{row.metric}</p>
                <p className="text-xs text-muted">{row.deltaPct.toFixed(1)}%</p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight">Engine calls</h2>
        <div className="mt-3 space-y-2">
          {board.map((call) => (
            <Card key={call.exerciseId}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">{call.exerciseName}</p>
                <Badge tone={call.action === "easier_week" ? "warning" : "muted"}>{actionLabel(call.action)}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted">{call.why}</p>
            </Card>
          ))}
        </div>
      </section>

      {isPending ? (
        <div className="mt-8 h-24 animate-pulse rounded-2xl bg-raised" />
      ) : user ? (
        <form
          className="mt-8 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask();
          }}
        >
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Why did bench stall in The Grind?"
          />
          <Button className="w-full" type="submit" disabled={busy}>
            {busy ? "Reading the locker…" : labLast ? "Ask again" : "Ask the Lab"}
          </Button>
        </form>
      ) : (
        <p className="mt-8 text-sm text-muted" data-testid="lab-guest-note">
          <Link to="/login" className="text-accent underline-offset-2 hover:underline">
            Sign in
          </Link>{" "}
          for a written second opinion. It reads your full synced log and files every answer.
        </p>
      )}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {labLast ? (
        <Card className="mt-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
            Note from {new Date(labLast.askedAt).toLocaleString()}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">{labLast.text}</p>
        </Card>
      ) : (
        <p className="mt-6 text-sm text-muted">The read above is worked out on this device. Signed in, you can ask for a second opinion.</p>
      )}
      {history.length > 1 ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Filed notes</h2>
          <div className="mt-3 space-y-2">
            {history.slice(1).map((note) => (
              <Card key={note.id}>
                {note.question ? <p className="text-sm font-medium">{note.question}</p> : null}
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{note.answer}</p>
                <p className="mt-2 font-mono text-[11px] text-subtle">{note.createdAt.slice(0, 10)}</p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </Page>
  );
}
