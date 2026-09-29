# Fonts

The app serves its own fonts (`src/fonts.css`, woff2, Latin subset) so they load with the page and
work offline. Nothing is fetched from a font CDN.

| Family | Weights | Used for | Source package | Licence |
|---|---|---|---|---|
| Big Shoulders Display | 700, 800 (600 uses the nearest) | headings, big numbers, posters | `@fontsource/big-shoulders-display` | SIL Open Font License 1.1 |
| Archivo | one variable file, 100 to 900 | body text | `@fontsource-variable/archivo` | SIL Open Font License 1.1 |
| IBM Plex Mono | 400, 500 | numbers in tables and set rows | `@fontsource/ibm-plex-mono` | SIL Open Font License 1.1 |

The family names live in one place, `FONTS` in `src/lib/brand.ts`. `styles.css` sets the same names as
`--font-*`, and canvas drawing (posters, receipts, the lock-screen art) reads them from there;
`brand.test.ts` fails if they drift or an old face comes back.

**Licence.** The OFL asks that the copyright notice and licence text travel with the font. They are in
`public/font-licences.txt` (served at `/font-licences.txt`), copied from each package's `LICENSE`. When a
package is added, removed or upgraded, regenerate that file from the packages and check the notice.

**Why IBM Plex Mono stays.** The plan (D9 and the knurl port) names Big Shoulders Display and Archivo and no
mono face. The app shows a lot of aligned digits, so the mono face stays until Archivo's tabular figures are
checked in every table. That is a decision for the owner.

**Replaced.** Barlow and Barlow Condensed (Step 10c). Their packages were removed.
