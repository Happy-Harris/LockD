import { useEffect, useState } from "react";
import { restoreTextSizeFromDevice, setTextSize, storedTextSize } from "@/lib/device/text-size";

/**
 * Text size, step B (spec fix 5): the default became Comfortable, so a lifter who never chose a size is told
 * once, on their next open, and can keep the previous one. Either answer is stored, so it never shows again.
 */
export function TextSizeNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    // A choice kept only in the device table (the mirror was cleared) is a choice: restore it first.
    void restoreTextSizeFromDevice().then(() => {
      if (live) setShow(storedTextSize() === null);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!show) return null;
  return (
    <div role="status" data-testid="text-size-notice" className="border-b border-line bg-raised px-4 py-3 text-sm text-ink">
      <p>Text is larger now. Change it in Settings → Appearance.</p>
      <div className="mt-2 flex gap-4 text-xs font-medium">
        <button
          type="button"
          className="min-h-11 underline underline-offset-2"
          onClick={() => {
            setTextSize("standard");
            setShow(false);
          }}
        >
          Keep previous size
        </button>
        <button
          type="button"
          className="min-h-11 underline underline-offset-2"
          onClick={() => {
            setTextSize("comfortable");
            setShow(false);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
