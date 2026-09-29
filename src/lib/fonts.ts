import { FONTS } from "./brand";

/**
 * The faces the canvases draw with (posters, receipts, lock-screen art). A canvas has no way to wait for a
 * font: drawn too early it silently uses a fallback face, so the PNG comes out in the wrong type (plan I-32).
 * The download functions check `canvasFontsLoaded()` and, only if a face is still loading, wait for
 * `loadCanvasFonts()` first; when they are loaded the drawing stays synchronous inside the tap.
 */
const SPECS = [
  `700 48px ${FONTS.display}`,
  `800 96px ${FONTS.display}`,
  `400 22px ${FONTS.sans}`,
  `500 22px ${FONTS.sans}`,
  `600 22px ${FONTS.sans}`,
  `500 22px ${FONTS.mono}`,
];

const api = () => (typeof document === "undefined" ? undefined : document.fonts);

export function canvasFontsLoaded(): boolean {
  const fonts = api();
  if (!fonts) return true;
  return SPECS.every((spec) => fonts.check(spec));
}

/** Loads every face the canvases use, then waits for the page's fonts to settle. Never rejects. */
export async function loadCanvasFonts(): Promise<void> {
  const fonts = api();
  if (!fonts) return;
  try {
    await Promise.all(SPECS.map((spec) => fonts.load(spec)));
    await fonts.ready;
  } catch {
    // A font that fails to load leaves the fallback face; the canvas still draws.
  }
}
