import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: "muted" | "accent" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    muted: "bg-raised text-muted",
    accent: "bg-accent/15 text-accent",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/15 text-danger",
  };
  return (
    <span
      className={cn(
        // A badge is one short label: it never wraps or shrinks, however wide the typeface.
        "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[11px] font-medium tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
