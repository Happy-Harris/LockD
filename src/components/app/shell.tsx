import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  Ellipsis,
  Film,
  FlaskConical,
  LayoutGrid,
  Lock,
  Ruler,
  Settings,
  Wrench,
} from "lucide-react";
import { LockdMark } from "@/components/app/mark";
import { HealthAutoRead } from "@/components/app/health-auto-read";
import { WatchSync } from "@/components/app/watch-sync";
import { RestTimerBar } from "@/components/app/rest-timer";
import { UserButton } from "@/lib/auth/gates";
import { useCanSignIn, useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCloud } from "@/lib/cloud/sync";
import { cn } from "@/lib/utils";

const PRIMARY = [
  { to: "/", label: "Today", icon: CalendarDays },
  { to: "/routines", label: "Train", icon: ClipboardList },
  { to: "/chronicle", label: "Chronicle", icon: BookOpen },
  { to: "/lab", label: "Lab", icon: FlaskConical },
] as const;

const ALL = [
  ...PRIMARY,
  { to: "/programs", label: "Programs", icon: LayoutGrid },
  { to: "/locker", label: "Locker", icon: Lock },
  { to: "/history", label: "History", icon: LayoutGrid },
  { to: "/analytics", label: "Data", icon: FlaskConical },
  { to: "/library", label: "Library", icon: Dumbbell },
  { to: "/vault", label: "Vault", icon: Film },
  { to: "/body", label: "Body", icon: Ruler },
  { to: "/tools", label: "Tools", icon: Wrench },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children, hideNav }: { children: React.ReactNode; hideNav?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const moreActive = [
    "/library",
    "/body",
    "/tools",
    "/settings",
    "/more",
    "/history",
    "/analytics",
    "/programs",
    "/wrapped",
    "/moments",
    "/vault",
    "/locker",
  ].some((path) => pathname.startsWith(path));

  return (
    <div className="min-h-dvh bg-canvas text-ink lg:flex">
      <aside className={cn("hidden w-60 shrink-0 border-r border-line lg:flex lg:flex-col lg:px-3 lg:py-6", hideNav && "lg:hidden")}>
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <LockdMark className="size-8" />
          <div>
            <p className="stamp text-xl leading-none text-ink">LOCKD</p>
            <p className="mt-1 text-micro font-medium uppercase tracking-[0.18em] text-subtle">Keep the receipt.</p>
          </div>
        </div>
        <nav aria-label="Primary" className="space-y-0.5">
          {ALL.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium",
                  active ? "bg-accent/12 text-accent" : "text-muted hover:bg-raised hover:text-ink",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <LockerChip />
      </aside>

      <div className="relative min-w-0 flex-1">
        {children}
        <RestTimerBar />
        <HealthAutoRead />
        <WatchSync />
      </div>

      {!hideNav ? (
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-30 bg-surface/95 backdrop-blur-xl lg:hidden"
          style={{ boxShadow: "0 -1px 0 color-mix(in oklab, var(--rf-ink) 12%, transparent)" }}
        >
          <ul className="mx-auto flex max-w-lg items-stretch px-1 pb-[env(safe-area-inset-bottom)]">
            {PRIMARY.map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <li key={item.to} className="min-w-0 flex-1">
                  <Link
                    to={item.to}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 text-tab font-semibold tracking-wide",
                      active ? "text-accent" : "text-subtle",
                    )}
                  >
                    <span className={cn("grid size-8 place-items-center rounded-full", active && "bg-accent/15")}>
                      <Icon className="size-5" strokeWidth={active ? 2.2 : 1.7} />
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li className="min-w-0 flex-1">
              <Link
                to="/more"
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-tab font-semibold tracking-wide",
                  moreActive ? "text-accent" : "text-subtle",
                )}
              >
                <span className={cn("grid size-8 place-items-center rounded-full", moreActive && "bg-accent/15")}>
                  <Ellipsis className="size-5" strokeWidth={moreActive ? 2.2 : 1.7} />
                </span>
                More
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </div>
  );
}

export function Page({
  children,
  wide,
  hideNav,
}: {
  children: React.ReactNode;
  wide?: boolean;
  hideNav?: boolean;
}) {
  return (
    <AppShell hideNav={hideNav}>
      <main
        id="main"
        className={cn("page-enter mx-auto px-4 pt-6", hideNav ? "pb-8" : "safe-bottom", wide ? "max-w-5xl" : "max-w-lg")}
      >
        {children}
      </main>
    </AppShell>
  );
}

function LockerChip() {
  const { user, isPending } = useCurrentUserState();
  const { status, profile } = useCloud();
  const label =
    status === "saving" ? "Saving…" : status === "pulling" ? "Opening locker…" : status === "error" ? "Sync missed" : "On the locker";

  const canSignIn = useCanSignIn();

  if (isPending) return <div className="mt-auto h-16 animate-pulse rounded-xl bg-raised" />;
  if (!user && !canSignIn) {
    return <p className="mt-auto px-3 pt-8 font-mono text-micro tracking-wide text-subtle">⌘K to jump</p>;
  }
  if (!user) {
    return (
      <div className="mt-auto px-2 pt-8">
        <Link
          to="/login"
          className="block rounded-xl bg-raised px-3 py-3 hairline"
        >
          <p className="text-sm font-medium text-ink">Sign in</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">Keep this log on the locker. Share a real link.</p>
        </Link>
        <p className="mt-3 px-1 font-mono text-micro tracking-wide text-subtle">⌘K to jump</p>
      </div>
    );
  }

  return (
    <div className="mt-auto space-y-3 px-2 pt-8">
      <Link to="/locker" className="block rounded-xl bg-raised px-3 py-3 hairline">
        <p className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">{label}</p>
        <p className="mt-1 text-sm font-medium text-ink">{profile?.displayName || user.displayName || "Lifter"}</p>
        {profile?.handle ? <p className="text-xs text-accent">@{profile.handle}</p> : null}
      </Link>
      <UserButton />
      <p className="px-1 font-mono text-micro tracking-wide text-subtle">⌘K to jump</p>
    </div>
  );
}
