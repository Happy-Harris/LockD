import { LockdMark } from "@/components/app/mark";
import { formatLocalDate } from "@/domain/time";
import { formatWeightWithUnit, type WeightUnit } from "@/domain/units";
import type { TrainingMoment } from "@/lib/gym/moments";
import { cn } from "@/lib/utils";
import { BRAND, FONTS } from "@/lib/brand";
import { canvasFontsLoaded, loadCanvasFonts } from "@/lib/fonts";
import { layoutPoster, POSTER } from "@/lib/poster-layout";

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
        <p className="text-micro font-medium uppercase tracking-[0.28em] opacity-55">
          {moment.kicker}
        </p>
        <LockdMark className="size-8 opacity-80" />
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

/**
 * Downloads the poster as a PNG. If a font is still loading it waits for it first, so the image is never
 * drawn in a fallback face; when the fonts are ready it draws inside the tap, as before.
 */
export function downloadPosterPng(filename: string, moment: TrainingMoment): void | Promise<void> {
  if (!canvasFontsLoaded()) return loadCanvasFonts().then(() => drawPoster(filename, moment));
  drawPoster(filename, moment);
}

function drawPoster(filename: string, moment: TrainingMoment) {
  const width = 1080;
  const height = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const titleFont = (px: number) => `800 ${px}px ${FONTS.display}, Arial Narrow, sans-serif`;
  const detailFont = `500 28px ${FONTS.sans}, sans-serif`;
  const layout = layoutPoster({
    title: moment.title,
    detail: moment.detail,
    hasValue: !!moment.valueLabel,
    width,
    height,
    measureTitle: (text, px) => {
      ctx.font = titleFont(px);
      return ctx.measureText(text).width;
    },
    measureDetail: (text) => {
      ctx.font = detailFont;
      return ctx.measureText(text).width;
    },
  });

  ctx.fillStyle = BRAND.chalk;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = BRAND.oxide;
  ctx.fillRect(0, 0, width, 18);
  ctx.font = `600 22px ${FONTS.sans}, sans-serif`;
  ctx.fillStyle = "#6a6358";
  ctx.fillText(moment.kicker.toUpperCase(), POSTER.marginX, 120);
  ctx.fillStyle = BRAND.ink;
  ctx.font = titleFont(layout.titleFontPx);
  layout.titleLines.forEach((line, i) => {
    ctx.fillText(line, POSTER.marginX, layout.titleY + i * layout.titleLineHeight);
  });
  if (moment.valueLabel && layout.valueY !== undefined) {
    ctx.fillStyle = BRAND.oxide;
    ctx.font = `700 48px ${FONTS.display}, sans-serif`;
    ctx.fillText(moment.valueLabel, POSTER.marginX, layout.valueY);
  }
  ctx.fillStyle = "#4a453c";
  ctx.font = detailFont;
  layout.detailLines.forEach((line, i) => {
    ctx.fillText(line, POSTER.marginX, layout.detailY + i * layout.detailLineHeight);
  });
  ctx.fillStyle = "#6a6358";
  ctx.font = `500 22px ${FONTS.sans}, sans-serif`;
  ctx.fillText(moment.date, POSTER.marginX, height - POSTER.footerOffset);
  ctx.font = `800 32px ${FONTS.display}, sans-serif`;
  ctx.fillStyle = BRAND.ink;
  ctx.fillText(moment.eraName ?? "LOCKD", width - 320, height - POSTER.footerOffset);
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
