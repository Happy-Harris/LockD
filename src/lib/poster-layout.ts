/**
 * Layout for the downloadable canvases (moment posters and session receipts), kept pure so it can be
 * tested with long lift names without a browser. Callers pass a `measure` function (the canvas's
 * `measureText` at the right font) and get back lines and y positions.
 *
 * Why this exists (plan I-32): the poster used to draw the value and detail at fixed y positions
 * (500 and 560) under a title that wraps from y = 240, so a title of three or more lines overlapped
 * them, and a single word wider than the poster ran off its edge. A receipt silently dropped every line
 * past the canvas height.
 */

export type Measure = (text: string) => number;

/**
 * Breaks `text` into lines no wider than `maxWidth`. Words wrap; a single word wider than a whole line
 * is broken by character, so nothing is ever drawn past the edge. Blank lines in `text` are kept.
 */
export function wrapLines(text: string, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    const push = () => {
      if (current) lines.push(current);
      current = "";
    };
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }
      push();
      if (measure(word) <= maxWidth) {
        current = word;
        continue;
      }
      // A word wider than a line: split it by character.
      let piece = "";
      for (const char of word) {
        if (piece && measure(piece + char) > maxWidth) {
          lines.push(piece);
          piece = "";
        }
        piece += char;
      }
      current = piece;
    }
    push();
  }
  return lines;
}

export interface PosterInput {
  title: string;
  detail: string;
  hasValue: boolean;
  width: number;
  height: number;
  /** Width of `text` set as the title at `px` (the display face, heavy). */
  measureTitle: (text: string, px: number) => number;
  /** Width of `text` set as the detail (the body face). */
  measureDetail: Measure;
}

export interface PosterLayout {
  titleFontPx: number;
  titleLines: string[];
  titleLineHeight: number;
  /** Baseline of the first title line. */
  titleY: number;
  /** Baseline of the value label, when there is one. */
  valueY?: number;
  detailLines: string[];
  detailLineHeight: number;
  /** Baseline of the first detail line. */
  detailY: number;
  /** True when the detail was cut with an ellipsis to fit; the title is never cut. */
  detailCut: boolean;
}

export const POSTER = {
  marginX: 72,
  titleY: 240,
  /** The title sizes tried, largest first. The first that fits is used. */
  titleSizes: [96, 80, 64, 52, 44],
  valueFloorY: 500,
  detailFloorY: 560,
  detailLineHeight: 40,
  /** The footer (date and era) sits at height - 80; content ends 90 px above it. */
  footerOffset: 80,
  footerClearance: 90,
} as const;

/**
 * Positions for a poster. Short titles (one or two lines) land exactly where they always did, so those
 * posters do not change; longer titles push the value and detail down, then shrink, so nothing overlaps
 * and nothing runs into the footer. A detail that still cannot fit is cut with a visible ellipsis.
 */
export function layoutPoster(input: PosterInput): PosterLayout {
  const contentWidth = input.width - POSTER.marginX * 2;
  const limit = input.height - POSTER.footerOffset - POSTER.footerClearance;
  const detailLines = wrapLines(input.detail, contentWidth, input.measureDetail);

  let chosen: PosterLayout | undefined;
  for (const px of POSTER.titleSizes) {
    const titleLines = wrapLines(input.title, contentWidth, (s) => input.measureTitle(s, px));
    const lastBaseline = POSTER.titleY + (titleLines.length - 1) * px;
    const valueY = input.hasValue ? Math.max(POSTER.valueFloorY, lastBaseline + px) : undefined;
    const detailY = Math.max(POSTER.detailFloorY, (valueY ?? lastBaseline + px) + 60);
    const layout: PosterLayout = {
      titleFontPx: px,
      titleLines,
      titleLineHeight: px,
      titleY: POSTER.titleY,
      valueY,
      detailLines,
      detailLineHeight: POSTER.detailLineHeight,
      detailY,
      detailCut: false,
    };
    chosen = layout;
    const detailBottom = detailY + (detailLines.length - 1) * POSTER.detailLineHeight;
    if (detailBottom <= limit) return layout;
  }

  // Even the smallest title leaves too little room: keep the title, cut the detail visibly.
  const fallback = chosen!;
  const room = Math.floor((limit - fallback.detailY) / POSTER.detailLineHeight) + 1;
  if (room >= detailLines.length) return fallback;
  const kept = detailLines.slice(0, Math.max(room, 0));
  if (kept.length > 0)
    kept[kept.length - 1] = `${kept[kept.length - 1]!.replace(/[\s.,;:]+$/, "")}…`;
  return { ...fallback, detailLines: kept, detailCut: true };
}

/**
 * Height for a text receipt canvas: every line fits, so a long session is never cut off. Never shorter
 * than `minHeight`.
 */
export function receiptHeight(
  lineCount: number,
  opts: { top: number; lineHeight: number; bottom: number; minHeight: number },
): number {
  return Math.max(opts.minHeight, opts.top + lineCount * opts.lineHeight + opts.bottom);
}

/**
 * Browsers cap canvas size (iPhone Safari allows about 4096 x 4096 in area), so a huge receipt has to stop
 * somewhere. It stops with a visible last line that says how many lines were left out; it never drops them
 * silently.
 */
export function fitReceiptLines(
  lines: string[],
  opts: { top: number; lineHeight: number; bottom: number; maxHeight: number },
): { lines: string[]; cut: number } {
  const room = Math.floor((opts.maxHeight - opts.top - opts.bottom) / opts.lineHeight);
  if (lines.length <= room) return { lines, cut: 0 };
  const kept = lines.slice(0, Math.max(room - 1, 0));
  const cut = lines.length - kept.length;
  return { lines: [...kept, `… ${cut} more lines not shown`], cut };
}
