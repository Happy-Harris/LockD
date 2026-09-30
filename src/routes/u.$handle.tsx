import { createFileRoute, Link } from "@tanstack/react-router";
import { PaperShell } from "@/components/app/paper-shell";
import { Button } from "@/components/ui/button";
import { Card, Stat } from "@/components/ui/card";
import { getLocker } from "@/lib/cloud/api";
import type { LockerCard } from "@/lib/cloud/types";
import { lockerOg } from "@/lib/og/tags";

export const Route = createFileRoute("/u/$handle")({
  // Loaded before the page renders so the card tags are in the server-rendered HTML. `getLocker` only answers for
  // a public locker, so a private one gets the generic site tags and the same "no public locker" page.
  loader: async ({ params, parentMatchPromise }) => {
    const origin = (await parentMatchPromise).loaderData?.origin ?? "";
    try {
      return { origin, result: await getLocker({ data: { handle: params.handle } }) };
    } catch {
      return { origin, result: { ok: false as const, error: "That locker could not be loaded." } };
    }
  },
  head: ({ loaderData, params }) => ({
    meta: lockerOg(loaderData?.origin ?? "", params.handle, loaderData?.result.ok ? loaderData.result.card : null),
  }),
  component: LockerPublicPage,
});

function LockerPublicPage() {
  const { result } = Route.useLoaderData();
  const error = result.ok ? null : result.error;
  const card: LockerCard | null = result.ok ? result.card : null;

  if (error) {
    return (
      <PaperShell>
        <p className="text-sm text-muted">{error}</p>
        <Button className="mt-4" asChild>
          <Link to="/">Open Lock’d</Link>
        </Button>
      </PaperShell>
    );
  }
  if (!card) {
    return (
      <PaperShell>
        <div className="h-80 animate-pulse rounded-2xl bg-raised" />
      </PaperShell>
    );
  }

  return (
    <PaperShell kicker="Public locker">
      <p className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">@{card.handle}</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">{card.displayName}</h1>
      {card.bio ? <p className="mt-3 text-sm leading-relaxed text-muted">{card.bio}</p> : null}
      <p className="mt-2 text-sm text-muted">
        {card.lens ? `${card.lens} · ` : ""}
        {card.era ?? "No named era yet"}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Card className="p-3">
          <Stat label="Sessions" value={String(card.sessions)} />
        </Card>
        <Card className="p-3">
          <Stat label="Streak" value={`${card.streak}d`} />
        </Card>
      </div>

      {card.relative.length ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Relative</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {card.relative.map((row) => (
              <Card key={row.name} className="p-3">
                <p className="text-xs text-muted">{row.name}</p>
                <p className="mt-1 font-display text-2xl font-semibold tabular">{row.ratio.toFixed(2)}×</p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {card.moments.length ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Stamps</h2>
          <div className="mt-3 space-y-2">
            {card.moments.map((moment) => (
              <Card key={moment.id}>
                <p className="text-micro-legacy uppercase tracking-[0.16em] text-subtle">{moment.kicker}</p>
                <p className="mt-1 font-medium">{moment.title}</p>
                <p className="mt-1 text-sm text-muted">{moment.detail}</p>
                <p className="mt-2 font-mono text-micro text-subtle">{moment.date}</p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <Button className="mt-8 w-full" asChild>
        <Link to="/">Open Lock’d</Link>
      </Button>
    </PaperShell>
  );
}
