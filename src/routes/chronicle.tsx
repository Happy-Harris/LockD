import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Page } from "@/components/app/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatLocalDate } from "@/domain/time";
import { formatWeightWithUnit, weightUnitFor } from "@/domain/units";
import { useGymDerived } from "@/lib/gym/hooks";
import { useGym } from "@/lib/gym/store";
import { availableYears } from "@/lib/gym/wrapped";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chronicle")({ component: ChroniclePage });

function ChroniclePage() {
  const { chronicle, moments, slices, settings } = useGymDerived();
  const renameEra = useGym((s) => s.renameEra);
  const unit = weightUnitFor(settings.unitSystem);
  const years = availableYears(slices);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <Page>
      <p className="text-micro font-medium uppercase tracking-[0.18em] text-subtle">Training chronicle</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">The lifting life.</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Eras, layoffs, comebacks, PR runs. Named automatically. Rename anything that deserves a better title.
      </p>

      {chronicle.current ? (
        <Card className="mt-6">
          <p className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">Current era</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">{chronicle.current.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {formatLocalDate(chronicle.current.startDate)} – {formatLocalDate(chronicle.current.endDate)} ·{" "}
            {chronicle.current.sessions} sessions
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {chronicle.strongest ? (
              <div>
                <p className="text-micro-legacy uppercase tracking-[0.16em] text-subtle">Strongest stretch</p>
                <p className="mt-1 text-sm">{formatLocalDate(chronicle.strongest.startDate)}</p>
              </div>
            ) : null}
            {chronicle.biggestJump ? (
              <div>
                <p className="text-micro-legacy uppercase tracking-[0.16em] text-subtle">Biggest jump</p>
                <p className="mt-1 text-sm">{chronicle.biggestJump.title}</p>
                {chronicle.biggestJump.magnitude ? (
                  <p className="text-xs text-muted">{formatWeightWithUnit(chronicle.biggestJump.magnitude, unit)}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      ) : (
        <p className="mt-6 text-sm text-muted">Log a few months and the chronicle will start naming things.</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button asChild variant="secondary">
          <Link to="/wrapped">Yearly receipt</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/history">Session history</Link>
        </Button>
      </div>

      <h2 className="mt-8 font-display text-2xl font-semibold tracking-tight">Eras</h2>
      <div className="era-rail mt-4 space-y-3 pl-1">
        {[...chronicle.eras].reverse().map((era) => (
          <div key={era.id} className="relative pl-8">
            <span
              className={cn(
                "absolute rounded-full bg-raised hairline",
                era.tone === "brief" ? "left-1.5 top-4 size-3" : "left-0 top-4 size-6",
              )}
            />
            <Card>
              {editing === era.startDate ? (
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (draft.trim()) renameEra(era.startDate, draft.trim());
                    setEditing(null);
                  }}
                >
                  <Input value={draft} onChange={(event) => setDraft(event.target.value)} className="h-11" />
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                </form>
              ) : (
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    setEditing(era.startDate);
                    setDraft(era.name);
                  }}
                >
                  {era.tone === "brief" ? (
                    <>
                      <p className="font-display text-lg font-semibold tracking-tight text-muted">{era.name}</p>
                      <p className="mt-1 text-xs text-muted" data-testid="brief-return">
                        {formatLocalDate(era.startDate, { day: "numeric", month: "short", year: "numeric" })} · one
                        session between two layoffs · {era.hardSets} hard {era.hardSets === 1 ? "set" : "sets"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-display text-2xl font-semibold tracking-tight">{era.name}</p>
                      <p className="mt-1 text-xs text-muted">
                        {formatLocalDate(era.startDate)} – {formatLocalDate(era.endDate)} · {era.sessions} sessions ·{" "}
                        {era.hardSets} hard sets
                      </p>
                    </>
                  )}
                  <p className="mt-2 text-micro text-subtle">Tap to rename · auto: {era.autoName}</p>
                </button>
              )}
            </Card>
          </div>
        ))}
      </div>

      <h2 className="mt-8 font-display text-2xl font-semibold tracking-tight">Events</h2>
      <div className="mt-3 space-y-2">
        {chronicle.events
          .filter((event) => event.kind !== "era")
          .slice(0, 24)
          .map((event) => (
            <Card key={event.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{event.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{event.detail}</p>
                </div>
                <Badge tone={event.kind === "layoff" ? "warning" : event.kind === "pr_run" ? "accent" : "muted"}>
                  {event.kind.replace("_", " ")}
                </Badge>
              </div>
              <p className="mt-2 text-micro text-subtle">{formatLocalDate(event.startDate)}</p>
            </Card>
          ))}
      </div>

      <h2 className="mt-8 font-display text-2xl font-semibold tracking-tight">Firsts</h2>
      <div className="mt-3 space-y-2">
        {moments
          .filter((moment) => moment.kind === "first")
          .map((moment) => (
            <Link key={moment.id} to="/moments/$id" params={{ id: moment.id }}>
              <Card className={cn("flex items-center justify-between")}>
                <div>
                  <p className="text-sm font-medium">{moment.title}</p>
                  <p className="text-xs text-muted">{formatLocalDate(moment.date)}</p>
                </div>
                <Badge tone="accent">Poster</Badge>
              </Card>
            </Link>
          ))}
      </div>

      {years.length > 1 ? (
        <p className="mt-6 text-xs text-subtle">Yearly receipts available for {years.join(", ")}.</p>
      ) : null}

      {chronicle.eras.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted">Nothing to chronicle yet.</p>
      ) : null}
    </Page>
  );
}
