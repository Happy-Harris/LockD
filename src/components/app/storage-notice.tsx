import { Link } from "@tanstack/react-router";
import { useStorageStatus, type StorageNotice } from "@/lib/storage/backend";

function words(notice: StorageNotice): { text: string; settings: boolean } {
  switch (notice.kind) {
    case "unreadable-log":
      return notice.rawCopyKept
        ? {
            text: "We couldn’t read the log saved on this device. Nothing was deleted: a copy of it is kept under Settings, Safety copies, and you’re starting a new log.",
            settings: true,
          }
        : {
            text: "We couldn’t read the log saved on this device, and there’s nowhere safe to keep a copy here. Changes won’t be saved until that’s sorted, so nothing of the unreadable log is overwritten.",
            settings: false,
          };
    case "move-not-verified":
      return {
        text: "Your log couldn’t be moved to the new storage, so it’s still saved the old way. Nothing was lost.",
        settings: false,
      };
    case "write-failed":
      return {
        text: `The last change couldn’t be saved (${notice.message}). Free up space and keep this page open; it will try again on your next change.`,
        settings: false,
      };
  }
}

/** Tells the lifter when storage started or is going somewhere they should know about. */
export function StorageNoticeBanner() {
  const notice = useStorageStatus((s) => s.notice);
  const setNotice = useStorageStatus((s) => s.setNotice);
  if (!notice) return null;
  const { text, settings } = words(notice);
  return (
    <div
      role="status"
      data-testid="storage-notice"
      className="border-b border-warning/40 bg-warning/10 px-4 py-3 text-sm text-ink"
    >
      <p>{text}</p>
      <div className="mt-2 flex gap-4 text-xs font-medium">
        {settings ? (
          <Link to="/settings" className="underline underline-offset-2">
            Open Settings
          </Link>
        ) : null}
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => setNotice(null)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
