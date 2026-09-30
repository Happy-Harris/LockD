import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  as: Tag = "div",
  "data-testid": testId,
}: {
  className?: string;
  children: React.ReactNode;
  as?: "div" | "article" | "section" | "button" | "li";
  "data-testid"?: string;
}) {
  return (
    <Tag className={cn("rounded-2xl bg-surface p-4 hairline", className)} data-testid={testId}>
      {children}
    </Tag>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">{label}</p>
      <p className="mt-1 truncate font-display text-2xl font-semibold tracking-tight text-ink tabular">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
