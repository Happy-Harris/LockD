# Fonts

The app serves its own fonts (`src/fonts.css`, woff2, Latin subset) so they load with the page and
work offline. Nothing is fetched from a font CDN.

| Family | Weights | Source package | Licence |
|---|---|---|---|
| Barlow | 400, 500, 600, 700, 400 italic | `@fontsource/barlow` | SIL Open Font License 1.1 |
| Barlow Condensed | 600, 700, 800 | `@fontsource/barlow-condensed` | SIL Open Font License 1.1 |
| IBM Plex Mono | 400, 500 | `@fontsource/ibm-plex-mono` | SIL Open Font License 1.1 |

The licence text ships in each package (`node_modules/@fontsource/<name>/LICENSE`). The visual
identity PR (plan PR 10) replaces these with Big Shoulders Display and Archivo and adds their licence
text here.
