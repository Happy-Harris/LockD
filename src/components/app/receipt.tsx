import { formatLocalDate } from "@/domain/time";
import { formatDuration, formatWeightWithUnit, type WeightUnit } from "@/domain/units";
import type { PersonalRecord, SessionSlice } from "@/lib/gym/analytics";
import { hardSetCount } from "@/domain/volume";
import { LockdMark } from "./mark";
import { BRAND, FONTS } from "@/lib/brand";
import { canvasFontsLoaded, loadCanvasFonts } from "@/lib/fonts";
import { fitReceiptLines, receiptHeight, wrapLines } from "@/lib/poster-layout";

export function SessionReceipt({
  slice,
  prs,
  unit,
  duration,
  tonnage,
}: {
  slice: SessionSlice;
  prs: PersonalRecord[];
  unit: WeightUnit;
  duration: number;
  tonnage: number;
}) {
  const serial = slice.workout.id
    .replace(/[^a-z0-9]/gi, "")
    .slice(-6)
    .toUpperCase();
  return (
    <article className="receipt px-5 py-6">
      <header className="flex items-start justify-between gap-3 border-b border-dashed border-current/20 pb-4">
        <div>
          <p className="stamp text-3xl leading-none tracking-tight">LOCKD</p>
          <p className="mt-1 text-micro-legacy font-medium uppercase tracking-[0.22em] opacity-60">
            Keep the receipt.
          </p>
        </div>
        <LockdMark className="size-9" />
      </header>
      <p className="mt-4 text-micro-legacy font-medium uppercase tracking-[0.18em] opacity-55">
        Session #{serial}
      </p>
      <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight">
        {slice.workout.name}
      </h2>
      <p className="mt-1 text-sm opacity-70">{formatLocalDate(slice.workout.localDate)}</p>
      <dl className="mt-5 grid grid-cols-3 gap-2 border-y border-dashed border-current/20 py-4">
        <div>
          <dt className="text-micro-legacy uppercase tracking-[0.16em] opacity-55">Time</dt>
          <dd className="mt-1 font-display text-xl font-semibold tabular">
            {formatDuration(duration)}
          </dd>
        </div>
        <div>
          <dt className="text-micro-legacy uppercase tracking-[0.16em] opacity-55">Hard sets</dt>
          <dd className="mt-1 font-display text-xl font-semibold tabular">
            {hardSetCount(slice.sets)}
          </dd>
        </div>
        <div>
          <dt className="text-micro-legacy uppercase tracking-[0.16em] opacity-55">Tonnage</dt>
          <dd className="mt-1 font-display text-xl font-semibold tabular">
            {formatWeightWithUnit(tonnage, unit)}
          </dd>
        </div>
      </dl>
      <ul className="mt-4 space-y-3">
        {slice.exercises.map((exercise) => {
          const sets = slice.sets
            .filter((set) => set.workoutExerciseId === exercise.id && set.isCompleted)
            .sort((a, b) => a.order - b.order);
          const isPr = prs.some((pr) => pr.exerciseId === exercise.exerciseId);
          return (
            <li key={exercise.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {exercise.exerciseNameSnapshot}
                  {isPr ? (
                    <span className="ml-2 text-micro-legacy font-semibold uppercase tracking-[0.16em] text-accent">
                      PR
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 font-mono text-xs tabular opacity-70">
                  {sets
                    .map((set) =>
                      set.weightG
                        ? `${formatWeightWithUnit(set.weightG, unit)} × ${set.reps ?? "—"}`
                        : `${set.reps ?? "—"} reps`,
                    )
                    .join("  ·  ") || "No completed sets"}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {prs.length > 0 ? (
        <p className="mt-5 border-t border-dashed border-current/20 pt-4 text-xs uppercase tracking-[0.16em] opacity-70">
          {prs.length} new estimated 1RM stamp{prs.length === 1 ? "" : "s"} on file.
        </p>
      ) : (
        <p className="mt-5 border-t border-dashed border-current/20 pt-4 text-xs opacity-55">
          No new estimated 1RM this session.
        </p>
      )}
    </article>
  );
}

/**
 * Downloads the receipt as a PNG. Waits for a still-loading font first; when the fonts are ready it draws
 * inside the tap. The canvas is as tall as its lines need, so a long session is not cut off.
 */
export function downloadReceiptPng(node: HTMLElement, filename: string): void | Promise<void> {
  if (!canvasFontsLoaded()) return loadCanvasFonts().then(() => drawReceipt(node, filename));
  drawReceipt(node, filename);
}

const RECEIPT = {
  width: 720,
  top: 180,
  lineHeight: 30,
  bottom: 60,
  minHeight: 1080,
  maxHeight: 16000,
};

function drawReceipt(node: HTMLElement, filename: string) {
  const { width } = RECEIPT;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const bodyFont = `400 22px ${FONTS.sans}, sans-serif`;
  ctx.font = bodyFont;
  const wrapped = wrapLines(node.innerText, width - 96, (text) => ctx.measureText(text).width);
  // Browsers cap canvas size; past the cap the last line says how many lines were left out.
  const { lines } = fitReceiptLines(wrapped, RECEIPT);
  const height = receiptHeight(lines.length, RECEIPT);
  // Resizing a canvas resets its state, so size it first and set everything after.
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = BRAND.chalk;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = BRAND.oxide;
  ctx.fillRect(0, 0, width, 8);
  ctx.fillStyle = BRAND.ink;
  ctx.font = `800 64px ${FONTS.display}, Arial Narrow, sans-serif`;
  ctx.fillText("LOCKD", 48, 96);
  ctx.font = `500 16px ${FONTS.sans}, sans-serif`;
  ctx.fillStyle = "#5c564c";
  ctx.fillText("KEEP THE RECEIPT.", 48, 124);
  ctx.fillStyle = BRAND.ink;
  ctx.font = bodyFont;
  let y = RECEIPT.top;
  for (const line of lines) {
    ctx.fillText(line, 48, y);
    y += RECEIPT.lineHeight;
  }
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
