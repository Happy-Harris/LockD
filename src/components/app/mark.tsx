/**
 * The Lock'd mark: an L on an Oxide tile. It is the same shape as the favicon and the app icons
 * (`scripts/make-icons.mjs` draws those), in the theme's accent and accent ink so it follows light and dark.
 */
export function LockdMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--rf-accent)" />
      <path d="M8 6h8v14h10v6H8Z" fill="var(--rf-accent-ink)" />
    </svg>
  );
}
