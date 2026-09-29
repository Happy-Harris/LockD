/**
 * The palette, in one place (plan D9, O3). `styles.css` holds the same values as CSS variables and
 * `brand.test.ts` fails if they drift; canvas drawing (posters, receipts, lock-screen art) and the
 * static files (manifest, favicon, OG card) read from here so nothing paints in a stale colour.
 *
 * Values come from the plan: Mill, Chalk, Steel, Oxide, Verdigris. The plan gives no value for
 * Graphite, so the card surfaces (`--rf-surface`, `--rf-raised`) keep their existing values.
 */
export const BRAND = {
  /** Page background, dark theme. */
  mill: "#0E0E0C",
  /** The one accent, for what is live or active. Replaces the old vermillion `#C24A32`. */
  oxide: "#C45C32",
  /**
   * Oxide darkened 20% toward Mill for text and fills on the light theme. Plain Oxide on Chalk is 3.3:1,
   * under the 4.5:1 that small text needs; this is 4.6:1 or better on every light surface.
   */
  oxideOnLight: "#A04C2A",
  /** Paper and receipt field, and the light theme's reference surface. */
  chalk: "#E8E2D4",
  /** Quiet text on dark surfaces. */
  steel: "#9A9588",
  /** Success and "done". */
  verdigris: "#6E8B74",
  /** Text on the light, printed surfaces. */
  ink: "#0E0E0C",
  /** Text on the dark surfaces. */
  inkOnDark: "#F6F1E8",
} as const;
