# Handoff — Lock’d (Keep the receipt)

Written from the code on 2026-09-29, after Step 11 of the consolidation plan. It replaces the app-builder-era brief.
For the running state read `docs/STATUS.md` (what is done and what is next) and the top of `docs/HANDOVER.md` (what shipped, most recent first). `CLAUDE.md` is the rulebook.

## Product

Lock’d is a training operating system for people who lift for years. **Keep the receipt** is the line and the test: *does a change help a lifter trust and understand their own record?* The record lives on the device (guest and offline work); sign-in upgrades it (sync, a public locker and share links, a Lab over the full history) and never gates logging. History, charts and export are free forever, and a test and an ESLint rule enforce it.

Brand: Lock’d / LOCKD / `lockd`. Palette in `src/lib/brand.ts` (Mill, Chalk, Steel, Oxide, Verdigris); faces are Big Shoulders Display, Archivo and IBM Plex Mono, self-hosted. The old names (RepForge, Strong-Pro, Certified, Knurl, Grok) never appear in user-facing copy; `npm run check:brand` reports them.

## How the code is arranged

- The log lives in one Zustand store (`src/lib/gym/store.ts`), persisted through the IndexedDB repository in `src/lib/storage/`. The old `localStorage['lockd-v1']` key is migrated, verified, and left in place as a safety copy. Video clips are blobs in IndexedDB `lockd-vault`, with `ClipMeta` in the store.
- Nothing derived is stored. Screens read `useGymDerived()` (`src/lib/gym/hooks.ts`), which builds session slices and runs the engines on read.
- Storage is integers: grams, millimetres, metres, seconds. kg/lb and cm/in are display only, so code that words a weight takes a `WeightUnit`.
- A new stored field is optional and travels through `src/domain/types.ts`, the zod schema in `src/lib/backup/schema.ts`, and the store's export/import, with an old-format fixture that still loads.
- Server functions (`src/lib/cloud/api.ts`, `src/lib/lab/ask.ts`) use `authMiddleware` and validate input with `src/lib/cloud/validate.ts`. Never trust a client-sent user id. Tables: `lockd_vaults`, `lockd_profiles`, `lockd_shares`, `lockd_lab_notes` (`migrations/`).
- Deterministic engines are never replaced by a chatbot. Lab answers cite the log.
- Product thresholds that are not research are exported constants plus an `implementation_heuristic` claim in `src/domain/evidence/catalog.ts`.

## What is built

Logger (sets, rest timer, previous values, ghost, unilateral pairs, supersets, RIR/RPE, clips), routines and programs (packs, import/export, progression rules, completion), history and analytics (weekly verdict, muscle sets, change flags, records, Chronicle eras, autopsy, DNA, moments, wrapped), import and export (Strong, Hevy, two sister apps, JSON backup with validated restore, CSV), offline (service worker, `docs/OFFLINE.md`), sign-in, vault sync, public locker and shares, and the Lab.

## What is not verified

- **Real files.** The Hevy, sister-app and Strong importers are checked against synthetic or donor fixtures only, not against a fresh real export.
- **A database.** Sign-in, sync, shares and the server Lab have not been exercised end to end against a database in the recent sessions (none was available); the server input validators are unit-tested, the handlers are unchanged.
- **Real devices.** Rest-timer notifications and vibration, clip storage against a real recording, and the service worker on a phone were tested in headless Chromium only.
- **Screens at 1024 px** for several late changes (Chronicle eras, program-complete, the unit-aware Today milestones) were not looked at.
- **Long real histories.** Era detection and the thin-evidence gates were tuned on the demo year and synthetic logs, not on a multi-year import.

## Still to do

- **Step 12, in progress (owner approved the OG-tag move and the D16 deletions on 2026-09-29).** Done in 12a: the routes state their own share-card tags (`src/lib/og/tags.ts`, card image `public/og.png`) and the Grok head-injecting middleware, its Vite plugin and the third-party script are gone. Still to do: 12b the preview bridge, `src/lib/app-data/`, `src/lib/multiplayer/`, `scripts/with-app-env.mjs` and the legacy `test:legacy` suites; 12c the D16 dead code (`counterfactual`, `wouldBePr`, `sessionCountStreak`, the unused `short_rests` autopsy code); 12d the Grok auth broker and config-driven auth and cloud (plan § 5), which needs the owner’s choice of real OAuth providers. Until 12d, `.env.example` still mentions the Grok broker and sign-in still federates through it in preview.
- **Owner decisions** are collected in `docs/STATUS.md` § 5: the era rules, the autopsy load band, the pounds milestone ladder, the server size caps, D6's readings, `percent_deload`, `eraSplits`, `short_rests`, the default goal lifts.
- **Phase 3 and 4** (the owner's opportunities) come after stabilising; see `docs/STATUS.md` § 4. Native Live Activities (Capacitor) are not started; the web timer with MediaSession stands in.

## What not to do

- Do not market local-first as the value proposition; the record is the product, and the device is where it starts.
- Do not gate logging behind sign-in, and never paywall history.
- Do not invent targets or wellness scores. Missing data stays visible; it is never shown as zero or as a positive state.
- Do not rename a live identifier as a cleanup (`lockd-v1`, `lockd-vault`, `lockd-backup`, `lockd-program`, `/s/$id`, `/u/$handle`, the `lockd_*` tables): each is a migration.
- Do not force-push `main`, and ask before deleting a Lock’d feature.
