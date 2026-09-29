import { Sheet } from "@/components/ui/sheet";
import type { GoalLens } from "@/domain/types";
import { LENSES } from "@/lib/gym/lenses";
import { cn } from "@/lib/utils";

/**
 * The lens chooses which blocks the home screen shows and how the weekly verdict is worded. It
 * never changes a number and never changes which lifts are tracked: those are the lifter's.
 */
export function GoalLensSheet({
  open,
  onClose,
  lens,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  lens: GoalLens;
  onChange: (lens: GoalLens) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Goal lens"
      description="Same log, different emphasis. It changes what is shown and how the verdict is worded, never a number."
    >
      <ul className="space-y-2" data-testid="goal-lens-sheet">
        {LENSES.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-pressed={item.id === lens}
              onClick={() => {
                onChange(item.id);
                onClose();
              }}
              className={cn(
                "block w-full rounded-xl px-3 py-2 text-left",
                item.id === lens
                  ? "bg-accent/15 ring-1 ring-accent"
                  : "bg-raised hover:bg-raised/70",
              )}
            >
              <span className="block text-sm font-medium text-ink">{item.label}</span>
              <span className="block text-xs text-muted">{item.blurb}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
