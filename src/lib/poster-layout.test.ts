import { describe, expect, it } from "vitest";
import { fitReceiptLines, layoutPoster, POSTER, receiptHeight, wrapLines } from "./poster-layout";

/** A fake face: every character is `px * 0.5` wide in the title and 14 px in the detail. */
const measureTitle = (text: string, px: number) => text.length * px * 0.5;
const measureDetail = (text: string) => text.length * 14;
const W = 1080;
const H = 1350;
const base = { width: W, height: H, measureTitle, measureDetail };

const words = (n: number, word = "Deadlift") => Array.from({ length: n }, () => word).join(" ");

describe("wrapLines", () => {
  const measure = (s: string) => s.length * 10;

  it("wraps on spaces and keeps every word", () => {
    expect(wrapLines("one two three four", 90, measure)).toEqual(["one two", "three", "four"]);
  });

  it("breaks a word wider than a whole line by character, so nothing runs off the edge", () => {
    const lines = wrapLines("Pneumonoultramicroscopic", 100, measure);
    expect(lines.join("")).toBe("Pneumonoultramicroscopic");
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(100);
    expect(lines.length).toBeGreaterThan(1);
  });

  it("keeps a word that fits on its own line intact next to a huge one", () => {
    const lines = wrapLines("ok Pneumonoultramicroscopic ok", 100, measure);
    expect(lines[0]).toBe("ok");
    // The last piece of the broken word carries on into the next word on the same line.
    expect(lines.at(-1)).toMatch(/ ok$/);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(100);
  });

  it("keeps blank lines and handles empty text", () => {
    expect(wrapLines("a\n\nb", 100, measure)).toEqual(["a", "", "b"]);
    expect(wrapLines("", 100, measure)).toEqual([""]);
  });
});

describe("layoutPoster: short titles are exactly where they always were", () => {
  it("one and two lines: value at 500, detail at 560", () => {
    // At 96 px the fake face fits 19 characters a line.
    for (const [title, lines] of [
      [words(2), 1],
      ["First 180 kg deadlift", 2],
    ] as const) {
      const layout = layoutPoster({ ...base, title, detail: "Steady work.", hasValue: true });
      expect(layout.titleLines).toHaveLength(lines);
      expect(layout.titleFontPx).toBe(96);
      expect(layout.titleY).toBe(240);
      expect(layout.valueY).toBe(500);
      expect(layout.detailY).toBe(560);
      expect(layout.detailCut).toBe(false);
    }
  });

  it("without a value the detail is still at 560", () => {
    const layout = layoutPoster({ ...base, title: "Short", detail: "x", hasValue: false });
    expect(layout.valueY).toBeUndefined();
    expect(layout.detailY).toBe(560);
  });
});

describe("layoutPoster: long lift names", () => {
  it("a three-line title pushes the value and detail down instead of overlapping them", () => {
    const layout = layoutPoster({ ...base, title: words(6), detail: "Detail.", hasValue: true });
    expect(layout.titleLines).toHaveLength(3);
    const lastBaseline = 240 + 2 * 96;
    expect(layout.valueY).toBeGreaterThan(lastBaseline);
    expect(layout.valueY! - lastBaseline).toBeGreaterThanOrEqual(96);
    expect(layout.detailY - layout.valueY!).toBeGreaterThanOrEqual(60);
  });

  it("a very long title shrinks the type rather than running into the footer", () => {
    const layout = layoutPoster({ ...base, title: words(24), detail: "Detail.", hasValue: true });
    expect(layout.titleFontPx).toBeLessThan(96);
    const bottom = layout.detailY + (layout.detailLines.length - 1) * layout.detailLineHeight;
    expect(bottom).toBeLessThanOrEqual(H - POSTER.footerOffset - POSTER.footerClearance);
    expect(layout.detailCut).toBe(false);
  });

  it("one enormous word is broken, never drawn past the edge", () => {
    const title = "Pneumonoultramicroscopicsilicovolcanoconiosis Press";
    const layout = layoutPoster({ ...base, title, detail: "d", hasValue: true });
    for (const line of layout.titleLines) {
      expect(measureTitle(line, layout.titleFontPx)).toBeLessThanOrEqual(W - POSTER.marginX * 2);
    }
  });

  it("never overlaps and never leaves the poster, for every title length", () => {
    for (let n = 1; n <= 40; n += 1) {
      for (const hasValue of [true, false]) {
        const layout = layoutPoster({
          ...base,
          title: words(n),
          detail: words(20, "steady"),
          hasValue,
        });
        const lastTitle = layout.titleY + (layout.titleLines.length - 1) * layout.titleLineHeight;
        if (layout.valueY !== undefined) {
          expect(layout.valueY - lastTitle, `value clears title (n=${n})`).toBeGreaterThanOrEqual(
            layout.titleLineHeight,
          );
          expect(
            layout.detailY - layout.valueY,
            `detail clears value (n=${n})`,
          ).toBeGreaterThanOrEqual(60);
        } else {
          expect(layout.detailY - lastTitle, `detail clears title (n=${n})`).toBeGreaterThanOrEqual(
            layout.titleLineHeight,
          );
        }
        const bottom = layout.detailY + (layout.detailLines.length - 1) * layout.detailLineHeight;
        expect(bottom, `inside the footer clearance (n=${n})`).toBeLessThanOrEqual(
          H - POSTER.footerOffset - POSTER.footerClearance,
        );
      }
    }
  });

  it("a detail that cannot fit is cut with a visible ellipsis, and the title is kept whole", () => {
    const title = words(40);
    const layout = layoutPoster({ ...base, title, detail: words(200, "steady"), hasValue: true });
    expect(layout.detailCut).toBe(true);
    expect(layout.detailLines.at(-1)).toMatch(/…$/);
    expect(layout.titleLines.join(" ")).toBe(title);
  });
});

describe("receiptHeight", () => {
  const opts = { top: 180, lineHeight: 30, bottom: 60, minHeight: 1080 };

  it("is never shorter than the minimum", () => {
    expect(receiptHeight(3, opts)).toBe(1080);
  });

  it("grows to hold every line, so a long session is not cut off", () => {
    const lines = 200;
    const height = receiptHeight(lines, opts);
    expect(height).toBe(180 + 200 * 30 + 60);
    expect(180 + (lines - 1) * 30).toBeLessThanOrEqual(height - 60);
  });
});

describe("fitReceiptLines", () => {
  const opts = { top: 180, lineHeight: 30, bottom: 60, maxHeight: 1080 };
  const room = Math.floor((1080 - 180 - 60) / 30);

  it("keeps every line when they fit", () => {
    const lines = Array.from({ length: room }, (_, i) => `line ${i}`);
    expect(fitReceiptLines(lines, opts)).toEqual({ lines, cut: 0 });
  });

  it("when they do not, says how many were left out, and the count is right", () => {
    const lines = Array.from({ length: room + 10 }, (_, i) => `line ${i}`);
    const fit = fitReceiptLines(lines, opts);
    expect(fit.lines).toHaveLength(room);
    expect(fit.lines.at(-1)).toBe(`… ${fit.cut} more lines not shown`);
    // Everything either drawn as itself or counted in the note.
    expect(fit.lines.length - 1 + fit.cut).toBe(lines.length);
    expect(receiptHeight(fit.lines.length, { ...opts, minHeight: 0 })).toBeLessThanOrEqual(
      opts.maxHeight,
    );
  });
});
