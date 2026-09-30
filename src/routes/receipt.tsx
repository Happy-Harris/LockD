import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { LifetimeReceiptView } from "@/components/app/lifetime-receipt";
import { PaperShell } from "@/components/app/paper-shell";
import { PublishButton } from "@/components/app/publish-button";
import { downloadReceiptPng } from "@/components/app/receipt";
import { Button } from "@/components/ui/button";
import type { WeightUnit } from "@/domain/units";
import { useGym } from "@/lib/gym/store";
import { storedFingerprints } from "@/lib/import/batch";
import { defaultSelection, sessionRows } from "@/lib/import/wizard";
import { receiptOg } from "@/lib/og/tags";
import { lifetimeShare } from "@/lib/cloud/shares";
import { receiptFromExport, type LifetimeReceipt } from "@/lib/receipt/web-receipt";
import { cn } from "@/lib/utils";

/**
 * Opp 2: the web receipt. A public page, outside the gate and with no account: drop an export, read
 * it on this device, get the whole training life on one receipt. The file never leaves the browser.
 * "Continue in Lock'd" imports the same sessions into this browser's guest log. The one server call is
 * Opp 9's "Share a link to this receipt", for a signed-in lifter who presses it: it sends the receipt's
 * own numbers (`lifetimeShare`), never the file.
 */
const lifetimeTitle = (receipt: LifetimeReceipt) => {
  const first = receipt.firstDate.slice(0, 4);
  const last = receipt.lastDate.slice(0, 4);
  return `Training receipt ${first === last ? first : `${first}–${last}`}`;
};

export const Route = createFileRoute("/receipt")({
  loader: async ({ parentMatchPromise }) => ({
    origin: (await parentMatchPromise).loaderData?.origin ?? "",
  }),
  head: ({ loaderData }) => ({ meta: receiptOg(loaderData?.origin ?? "") }),
  component: ReceiptPage,
});


function ReceiptPage() {
  const navigate = useNavigate();
  const hydrated = useGym((s) => s.hydrated);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [unit, setUnit] = useState<WeightUnit>("kg");
  const [dragging, setDragging] = useState(false);
  const receiptRef = useRef<HTMLElement>(null);

  const result = useMemo(
    () => (file ? receiptFromExport(file.text, file.name, unit) : null),
    [file, unit],
  );
  const read = result?.ok ? result : null;
  // A header that says kg or lb wins; the switch only shows when the file does not say.
  const headerUnit = read?.analysis.detectedUnit;
  const shownUnit = headerUnit ?? unit;

  const open = async (picked: File | undefined) => {
    if (!picked) return;
    setFile({ name: picked.name, text: await picked.text() });
  };

  const continueInLockd = () => {
    if (!read || !file) return;
    const gym = useGym.getState();
    if (!gym.settings.onboardingCompletedAt) {
      gym.completeOnboarding({
        loadDemo: false,
        unitSystem: shownUnit === "lb" ? "imperial" : "metric",
      });
    }
    // The wizard's defaults: every session in the file that is not already in this browser's log.
    const selectedKeys = defaultSelection(sessionRows(read.analysis, storedFingerprints(useGym.getState())));
    useGym.getState().importPrepared({
      analysis: read.analysis,
      source: read.source,
      fileName: file.name,
      selectedKeys,
      allowDuplicates: false,
      nameOverrides: new Map(),
    });
    void navigate({ to: "/chronicle" });
  };

  return (
    <PaperShell>
      <h1 className="font-display text-4xl font-semibold tracking-tight">
        Your training life, on one receipt.
      </h1>
      <p className="mt-2 text-sm text-muted">
        Drop the export from Strong or Hevy. It is read here, on this device: the file is never
        uploaded, and you need no account.
      </p>

      <label
        className={cn(
          "mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center",
          dragging ? "border-accent bg-raised" : "border-current/20",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void open(event.dataTransfer.files[0]);
        }}
      >
        <span className="text-sm font-medium">
          {file ? file.name : "Drop your export here, or choose it"}
        </span>
        <span className="mt-1 text-xs text-subtle">A .csv file from Strong or Hevy</span>
        <input
          type="file"
          accept=".csv,text/csv"
          data-testid="receipt-file"
          className="sr-only"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = "";
            void open(picked);
          }}
        />
      </label>

      {result && !result.ok ? (
        <div role="alert" data-testid="receipt-problems" className="mt-4 rounded-xl bg-raised p-3 text-sm text-muted">
          {result.errors.map((line) => (
            <p key={line} className="mt-1 first:mt-0">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {read ? (
        <>
          <p className="mt-4 text-xs text-subtle" data-testid="receipt-source">
            Read as {read.source.label}.{" "}
            {headerUnit ? `Weights in ${headerUnit}, as the file’s header says.` : null}
          </p>
          {!headerUnit ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-subtle">
              <span>The file does not say kg or lb. Its weights are in</span>
              {(["kg", "lb"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setUnit(option)}
                  data-testid={`receipt-unit-${option}`}
                  aria-pressed={unit === option}
                  className={cn(
                    "h-9 rounded-full px-3 text-sm",
                    unit === option ? "bg-accent text-accent-ink" : "bg-raised hairline",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}

          <LifetimeReceiptView receipt={read.receipt} unit={shownUnit} innerRef={receiptRef} />

          <div className="mt-5 space-y-2">
            <Button
              className="w-full"
              size="lg"
              disabled={!hydrated}
              onClick={continueInLockd}
              data-testid="receipt-continue"
            >
              Continue in Lock’d
            </Button>
            <p className="text-center text-xs leading-relaxed text-subtle">
              Nothing is saved yet. Continuing keeps these sessions in this browser, with no
              account; sessions already here are recognised and left out.
            </p>
            <Button
              className="w-full"
              variant="secondary"
              onClick={() => {
                if (receiptRef.current) {
                  void downloadReceiptPng(receiptRef.current, "lockd-training-receipt.png");
                }
              }}
            >
              Save as image
            </Button>
            <PublishButton
              kind="lifetime"
              title={lifetimeTitle(read.receipt)}
              payload={lifetimeShare(read.receipt, shownUnit)}
              label="Share a link to this receipt"
              note="Publishes only the numbers on this receipt, never the file. Unpublish it from your Locker."
            />
          </div>
        </>
      ) : null}
    </PaperShell>
  );
}
