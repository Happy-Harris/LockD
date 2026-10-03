import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { reportError } from "@/lib/crash/report";

/**
 * A screen that failed to render. The raw error can carry server or database detail, so the lifter sees a plain
 * sentence and two ways out; the detail shows only in development.
 */
export function AppErrorComponent({ error, reset }: ErrorComponentProps) {
  useEffect(() => {
    reportError(error);
  }, [error]);
  const detail = import.meta.env.DEV && error instanceof Error ? error.message : null;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas px-6 text-center text-ink">
      <span className="text-danger" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted">
        This screen could not open. Your log is saved on this device and has not changed.
      </p>
      {detail ? <p className="max-w-md font-mono text-xs break-words text-subtle">{detail}</p> : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          Go to Today
        </a>
      </div>
    </main>
  );
}
