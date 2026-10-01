import { Link } from "@tanstack/react-router";
import { LockdMark } from "@/components/app/mark";

/** Any address that is not a Lock'd page. The log is untouched; this only says so and offers the way back. */
export function AppNotFoundComponent() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas px-6 text-center text-ink">
      <LockdMark className="size-10" />
      <h1 className="font-display text-2xl font-semibold tracking-tight">Nothing at this address</h1>
      <p className="max-w-sm text-sm text-muted">
        The link may be mistyped, or the page was moved or unpublished. Your log is on this device and has not changed.
      </p>
      <Link
        to="/"
        className="mt-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        Go to Today
      </Link>
    </main>
  );
}
