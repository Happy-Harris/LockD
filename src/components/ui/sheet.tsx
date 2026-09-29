import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A panel that slides up from the bottom on a phone and sits centred on a wide screen. It is a
 * modal dialog: focus moves into it, Escape and the close button dismiss it, and the page behind
 * does not scroll. Used for receipts ("why is this number what it is").
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: "md" | "lg";
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-surface p-5 text-ink hairline",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            size === "lg" ? "sm:max-w-xl" : "sm:max-w-md",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-display text-xl font-semibold tracking-tight">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-muted">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
