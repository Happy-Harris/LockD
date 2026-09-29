import { StampMark } from "@/components/app/mark";
import { formatLocalDate } from "@/domain/time";
import { formatWeightWithUnit, type WeightUnit } from "@/domain/units";
import type { TrainingMoment } from "@/lib/gym/moments";
import { cn } from "@/lib/utils";
import { BRAND, FONTS } from "@/lib/brand";

export function MomentPoster({
  moment,
  unit,
  valueG,
}: {
  moment: TrainingMoment;
  unit: WeightUnit;
  valueG?: number;
}) {
  const value = moment.valueLabel ?? (valueG ? formatWeightWithUnit(valueG, unit) : undefined);
  return (
    <article className={cn("moment-poster relative overflow-hidden px-6 py-8")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.28em] opacity-55">
          {moment.kicker}
        </p>
        <StampMark className="size-8 opacity-80" />
      </div>
      <p className="mt-8 stamp text-6xl leading-[0.85] tracking-tight">{moment.title}</p>
      {value ? <p className="mt-5 font-display text-3xl font-semibold tabular">{value}</p> : null}
      <p className="mt-3 max-w-sm text-sm leading-relaxed opacity-70">{moment.detail}</p>
      <div className="mt-8 flex items-end justify-between border-t border-dashed border-current/20 pt-4">
        <p className="text-xs uppercase tracking-[0.18em] opacity-55">
          {formatLocalDate(moment.date)}
        </p>
        <p className="stamp text-lg opacity-80">{moment.eraName ?? "LOCKD"}</p>
      </div>
    </article>
  );
}

export function downloadPosterPng(filename: string, moment: TrainingMoment) {
  const width = 1080;
  const height = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = BRAND.chalk;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = BRAND.oxide;
  ctx.fillRect(0, 0, width, 18);
  ctx.fillStyle = BRAND.ink;
  ctx.font = `600 22px ${FONTS.sans}, sans-serif`;
  ctx.fillStyle = "#6a6358";
  ctx.fillText(moment.kicker.toUpperCase(), 72, 120);
  ctx.fillStyle = BRAND.ink;
  ctx.font = `800 96px ${FONTS.display}, Arial Narrow, sans-serif`;
  wrap(ctx, moment.title, 72, 240, width - 144, 96);
  ctx.font = `500 28px ${FONTS.sans}, sans-serif`;
  ctx.fillStyle = "#4a453c";
  wrap(ctx, moment.detail, 72, 560, width - 144, 40);
  if (moment.valueLabel) {
    ctx.fillStyle = BRAND.oxide;
    ctx.font = `700 48px ${FONTS.display}, sans-serif`;
    ctx.fillText(moment.valueLabel, 72, 500);
  }
  ctx.fillStyle = "#6a6358";
  ctx.font = `500 22px ${FONTS.sans}, sans-serif`;
  ctx.fillText(moment.date, 72, height - 80);
  ctx.font = `800 32px ${FONTS.display}, sans-serif`;
  ctx.fillStyle = BRAND.ink;
  ctx.fillText(moment.eraName ?? "LOCKD", width - 320, height - 80);
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/);
  let line = "";
  let cursor = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cursor);
}
