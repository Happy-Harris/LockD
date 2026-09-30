import { Link } from "@tanstack/react-router";
import { LockdMark } from "@/components/app/mark";

export function PaperShell({ children, kicker }: { children: React.ReactNode; kicker?: string }) {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <main className="page-enter mx-auto max-w-lg px-4 py-10">
        <Link to="/" className="mb-8 flex items-center gap-2.5">
          <LockdMark className="size-8" />
          <span>
            <span className="stamp block text-xl leading-none">LOCKD</span>
            <span className="mt-1 block text-micro font-medium uppercase tracking-[0.18em] text-subtle">
              {kicker ?? "Keep the receipt."}
            </span>
          </span>
        </Link>
        {children}
      </main>
    </div>
  );
}
