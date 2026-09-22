export function StampMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--rf-accent)" />
      <path
        d="M9 7.5h6.2c3.7 0 6.1 2.1 6.1 5.35 0 2.2-1.15 3.9-3.15 4.75L22.4 24.5h-4.05l-3.85-6.55H13.1V24.5H9V7.5Zm4.1 3.15v4.55h2.05c1.85 0 2.95-1 2.95-2.3 0-1.3-1.1-2.25-2.95-2.25H13.1Z"
        fill="var(--rf-accent-ink)"
      />
    </svg>
  );
}
