import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  Dumbbell,
  Film,
  LayoutGrid,
  Lock,
  Ruler,
  Settings,
  Upload,
  Wrench,
} from "lucide-react";
import { Page } from "@/components/app/shell";
import { Card } from "@/components/ui/card";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCloud } from "@/lib/cloud/sync";

export const Route = createFileRoute("/more")({ component: MorePage });

const ITEMS = [
  { to: "/locker", label: "Locker", hint: "Handle, public stamps, published receipts", icon: Lock },
  {
    to: "/programs",
    label: "Programs",
    hint: "Multi-week blocks, deloads, shareable packs",
    icon: LayoutGrid,
  },
  { to: "/history", label: "History", hint: "Every completed session", icon: BookOpen },
  {
    to: "/analytics",
    label: "Data Lab",
    hint: "Weekly charts and goal-lift series",
    icon: Activity,
  },
  {
    to: "/library",
    label: "Library",
    hint: "Exercise DNA, standards, machine memory",
    icon: Dumbbell,
  },
  { to: "/vault", label: "Set vault", hint: "Clips attached to sets", icon: Film },
  { to: "/body", label: "Body", hint: "Weight and circumferences", icon: Ruler },
  { to: "/tools", label: "Tools", hint: "Plates and warm-ups", icon: Wrench },
  { to: "/import", label: "Import", hint: "Strong, Hevy, other apps, any CSV", icon: Upload },
  {
    to: "/settings",
    label: "Settings",
    hint: "Lens, presentation, backups, Strong CSV",
    icon: Settings,
  },
] as const;

function MorePage() {
  const { user, isPending } = useCurrentUserState();
  const { status, profile } = useCloud();
  return (
    <Page>
      <h1 className="font-display text-4xl font-semibold tracking-tight">More</h1>
      <p className="mt-1 text-sm text-muted">
        Everything that is not the daily loop. Press ⌘K to jump from anywhere.
      </p>
      {!isPending ? (
        <Link to={user ? "/locker" : "/login"} className="mt-4 block">
          <Card>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
              {user ? (status === "synced" ? "On the locker" : status) : "Guest"}
            </p>
            <p className="mt-1 font-medium">
              {user
                ? profile?.displayName || user.displayName || "Lifter"
                : "Sign in to keep this log"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {user
                ? profile?.handle
                  ? `@${profile.handle}`
                  : "Claim a handle on the locker."
                : "Phone, laptop, a link you can send."}
            </p>
          </Card>
        </Link>
      ) : (
        <div className="mt-4 h-24 animate-pulse rounded-2xl bg-raised" />
      )}
      <div className="mt-6 space-y-2">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.to} to={item.to}>
              <Card className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-raised">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block font-medium">{item.label}</span>
                  <span className="block text-sm text-muted">{item.hint}</span>
                </span>
              </Card>
            </Link>
          );
        })}
      </div>
    </Page>
  );
}
