import { formatLocalDate } from "@/domain/time";
import { formatDuration, formatWeightWithUnit, type WeightUnit } from "@/domain/units";
import type { PersonalRecord, SessionSlice } from "@/lib/gym/analytics";
import { hardSetCount } from "@/domain/volume";
import { StampMark } from "./mark";
import { BRAND } from "@/lib/brand";

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
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] opacity-60">
            Keep the receipt.
          </p>
        </div>
        <StampMark className="size-9" />
      </header>
      <p className="mt-4 text-[10px] font-medium uppercase tracking-[0.18em] opacity-55">
        Session #{serial}
      </p>
      <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight">
        {slice.workout.name}
      </h2>
      <p className="mt-1 text-sm opacity-70">{formatLocalDate(slice.workout.localDate)}</p>
      <dl className="mt-5 grid grid-cols-3 gap-2 border-y border-dashed border-current/20 py-4">
        <div>
          <dt className="text-[10px] uppercase tracking-[0.16em] opacity-55">Time</dt>
          <dd className="mt-1 font-display text-xl font-semibold tabular">
            {formatDuration(duration)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.16em] opacity-55">Hard sets</dt>
          <dd className="mt-1 font-display text-xl font-semibold tabular">
            {hardSetCount(slice.sets)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.16em] opacity-55">Tonnage</dt>
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
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
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

export function downloadReceiptPng(node: HTMLElement, filename: string) {
  const width = 720;
  const height = Math.max(1080, node.scrollHeight + 80);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = BRAND.chalk;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = BRAND.oxide;
  ctx.fillRect(0, 0, width, 8);
  ctx.fillStyle = BRAND.ink;
  ctx.font = "800 64px Barlow Condensed, Arial Narrow, sans-serif";
  ctx.fillText("LOCKD", 48, 96);
  ctx.font = "500 16px Barlow, sans-serif";
  ctx.fillStyle = "#5c564c";
  ctx.fillText("KEEP THE RECEIPT.", 48, 124);
  const text = node.innerText;
  ctx.fillStyle = BRAND.ink;
  ctx.font = "400 22px Barlow, sans-serif";
  const lines = wrapCanvasText(ctx, text, width - 96);
  let y = 180;
  for (const line of lines) {
    if (y > height - 60) break;
    ctx.fillText(line, 48, y);
    y += 30;
  }
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = words[0]!;
    for (let i = 1; i < words.length; i += 1) {
      const next = `${current} ${words[i]}`;
      if (ctx.measureText(next).width > maxWidth) {
        lines.push(current);
        current = words[i]!;
      } else {
        current = next;
      }
    }
    lines.push(current);
  }
  return lines;
}
