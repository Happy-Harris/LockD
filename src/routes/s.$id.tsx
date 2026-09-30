import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useImportProgram } from "@/lib/gym/program-hooks";
import { LifetimeReceiptView } from "@/components/app/lifetime-receipt";
import { MomentPoster } from "@/components/app/moment-poster";
import { PaperShell } from "@/components/app/paper-shell";
import { LockdMark } from "@/components/app/mark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDuration, formatWeightWithUnit } from "@/domain/units";
import { getShare } from "@/lib/cloud/api";
import type { PublicShare } from "@/lib/cloud/types";
import { useGym } from "@/lib/gym/store";
import { useCanSignIn, useCurrentUserState } from "@/lib/auth/use-current-user";
import { shareOg } from "@/lib/og/tags";

export const Route = createFileRoute("/s/$id")({
  // Loaded before the page renders so the share's card tags are in the server-rendered HTML. A failed or
  // unreachable lookup is carried to the page, which says so, instead of throwing.
  loader: async ({ params, parentMatchPromise }) => {
    const origin = (await parentMatchPromise).loaderData?.origin ?? "";
    try {
      return { origin, result: await getShare({ data: { id: params.id } }) };
    } catch {
      return { origin, result: { ok: false as const, error: "That receipt could not be loaded." } };
    }
  },
  head: ({ loaderData, params }) => ({
    meta: shareOg(loaderData?.origin ?? "", params.id, loaderData?.result.ok ? loaderData.result.share : null),
  }),
  component: SharePage,
});

function SharePage() {
  const { result } = Route.useLoaderData();
  const error = result.ok ? null : result.error;
  const share: PublicShare | null = result.ok ? result.share : null;

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
  if (!share) {
    return (
      <PaperShell>
        <div className="h-80 animate-pulse rounded-2xl bg-raised" />
      </PaperShell>
    );
  }

  return (
    <PaperShell kicker={share.payload.kind === "program" ? "A block, not a marketplace." : "Keep the receipt."}>
      <ShareBody share={share} />
    </PaperShell>
  );
}

function ShareBody({ share }: { share: PublicShare }) {
  const payload = share.payload;
  const athlete = payload.athlete;
  const handle = payload.handle;

  if (payload.kind === "moment") {
    return (
      <>
        <Athlete athlete={athlete} handle={handle} date={share.createdAt} />
        <div className="mt-6">
          <MomentPoster moment={payload.moment} unit={payload.unit} />
        </div>
        <OpenLockd />
      </>
    );
  }

  if (payload.kind === "receipt") {
    return (
      <>
        <Athlete athlete={athlete} handle={handle} date={share.createdAt} />
        <article className="receipt mt-6 px-5 py-6">
          <header className="flex items-start justify-between border-b border-dashed border-current/20 pb-4">
            <div>
              <p className="stamp text-3xl leading-none">LOCKD</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.22em] opacity-60">Session receipt</p>
            </div>
            <LockdMark className="size-9" />
          </header>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">{payload.workoutName}</h1>
          <p className="mt-1 text-sm opacity-70">{payload.date}</p>
          <dl className="mt-5 grid grid-cols-3 gap-2 border-y border-dashed border-current/20 py-4">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.16em] opacity-55">Time</dt>
              <dd className="mt-1 font-display text-xl font-semibold tabular">{formatDuration(payload.durationSec)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.16em] opacity-55">Hard sets</dt>
              <dd className="mt-1 font-display text-xl font-semibold tabular">{payload.hardSets}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.16em] opacity-55">Tonnage</dt>
              <dd className="mt-1 font-display text-xl font-semibold tabular">{payload.tonnageLabel}</dd>
            </div>
          </dl>
          <ul className="mt-4 space-y-3">
            {payload.lines.map((line) => (
              <li key={line.name}>
                <p className="text-sm font-medium">
                  {line.name}
                  {line.pr ? <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">PR</span> : null}
                </p>
                <p className="mt-0.5 font-mono text-xs tabular opacity-70">{line.sets}</p>
              </li>
            ))}
          </ul>
          {payload.eraName ? <p className="mt-5 text-xs uppercase tracking-[0.16em] opacity-55">{payload.eraName}</p> : null}
        </article>
        <OpenLockd />
      </>
    );
  }

  if (payload.kind === "wrapped") {
    const receipt = payload.receipt;
    return (
      <>
        <Athlete athlete={athlete} handle={handle} date={share.createdAt} />
        <article className="receipt mt-6 px-5 py-6">
          <p className="stamp text-4xl leading-none">LOCKD</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.22em] opacity-60">Training receipt {receipt.year}</p>
          <dl className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.16em] opacity-55">Sessions</dt>
              <dd className="mt-1 font-display text-3xl font-semibold tabular">{receipt.sessions}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.16em] opacity-55">Hard sets</dt>
              <dd className="mt-1 font-display text-3xl font-semibold tabular">{receipt.hardSets}</dd>
            </div>
          </dl>
          {receipt.topLift ? (
            <p className="mt-5 text-sm">
              Strongest stamp: {receipt.topLift.name} {formatWeightWithUnit(receipt.topLift.e1rmG, payload.unit)} e1RM.
            </p>
          ) : null}
          {receipt.eras.length ? <p className="mt-3 text-sm">Eras: {receipt.eras.join(" · ")}.</p> : null}
          {receipt.firsts.length ? <p className="mt-3 text-sm">Firsts: {receipt.firsts.join("; ")}.</p> : null}
        </article>
        <OpenLockd />
      </>
    );
  }

  if (payload.kind === "lifetime") {
    return (
      <>
        <Athlete athlete={athlete} handle={handle} date={share.createdAt} />
        <LifetimeReceiptView receipt={payload.receipt} unit={payload.unit} />
        <OpenLockd />
      </>
    );
  }

  return <ProgramShare share={share} />;
}

function ProgramShare({ share }: { share: PublicShare }) {
  const { user, isPending } = useCurrentUserState();
  const canSignIn = useCanSignIn();
  const importProgram = useImportProgram();
  const navigate = useNavigate();
  const payload = share.payload;
  if (payload.kind !== "program") return null;
  const file = payload.file;

  return (
    <>
      <Athlete athlete={payload.athlete} handle={payload.handle} date={share.createdAt} />
      <Card className="mt-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">{file.program.lens}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{file.program.name}</h1>
        <p className="mt-2 text-sm text-muted">{file.program.notes}</p>
        <p className="mt-3 text-xs text-subtle">
          {file.weeks.length} weeks · {file.sessions.length} sessions
        </p>
      </Card>
      {isPending ? <div className="mt-4 h-11 animate-pulse rounded-xl bg-raised" /> : null}
      {!isPending && user ? (
        <Button
          className="mt-4 w-full"
          onClick={() => {
            const id = importProgram(file);
            if (!useGym.getState().settings.onboardingCompletedAt) {
              useGym.getState().updateSettings({ onboardingCompletedAt: new Date().toISOString() });
            }
            void navigate({ to: "/programs/$id", params: { id } });
          }}
        >
          Install this block
        </Button>
      ) : null}
      {!isPending && !user && canSignIn ? (
        <Button className="mt-4 w-full" asChild>
          <Link to="/login">Sign in to install</Link>
        </Button>
      ) : null}
      <OpenLockd />
    </>
  );
}

function Athlete({ athlete, handle, date }: { athlete: string; handle?: string; date: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">From the locker</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">{athlete}</h1>
      {handle ? (
        <Link to="/u/$handle" params={{ handle }} className="mt-1 inline-block text-sm text-accent">
          @{handle}
        </Link>
      ) : null}
      <p className="mt-1 text-xs text-subtle">{new Date(date).toLocaleDateString()}</p>
    </div>
  );
}

function OpenLockd() {
  return (
    <Button className="mt-8 w-full" variant="secondary" asChild>
      <Link to="/">Open Lock’d</Link>
    </Button>
  );
}
