import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { restoreRawCopy } from "@/lib/storage/boot";
import { listSafetyBackups, type SafetyBackup } from "@/lib/storage/safety";

const REASON_LABEL: Record<SafetyBackup["reason"], string> = {
  "before-cloud-sign-in": "Before signing in",
  "pre-migration": "Before the move to the new storage",
  "before-restore": "Before a restore",
};

/** Settings → Data: copies taken automatically before the log was replaced or merged. */
export function SafetyBackups() {
  const [rows, setRows] = useState<SafetyBackup[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSafetyBackups()
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const download = (row: SafetyBackup) => {
    const blob = new Blob([row.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const kind = row.format === "raw-localstorage" ? "lockd-raw-log" : "lockd-safety-copy";
    a.download = `${kind}-${row.createdAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const restore = (row: SafetyBackup) => {
    if (
      !window.confirm(
        "Replace your current log with this copy? A safety copy of the current log is taken first.",
      )
    )
      return;
    restoreRawCopy(row.json)
      .then(() => toast.success("Restored the copy taken before the move."))
      .catch(() => toast.error("That copy couldn’t be restored."));
  };

  return (
    <div className="mt-4" data-testid="safety-backups">
      <p className="text-micro font-medium uppercase tracking-[0.16em] text-subtle">
        Safety copies
      </p>
      {rows === null ? null : rows.length === 0 ? (
        <p className="mt-1 text-sm text-muted">
          None yet. Lock’d saves one automatically before signing in replaces or merges this log.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-raised px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm">{REASON_LABEL[row.reason]}</p>
                <p className="font-mono text-micro text-subtle">
                  {new Date(row.createdAt).toLocaleString()} · {row.sessions} session
                  {row.sessions === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {row.format === "raw-localstorage" && row.sessions > 0 ? (
                  <Button size="sm" variant="secondary" onClick={() => restore(row)}>
                    Restore
                  </Button>
                ) : null}
                <Button size="sm" variant="secondary" onClick={() => download(row)}>
                  Download
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
