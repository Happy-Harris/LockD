# Health context (Opp 10)

Status: design doc only (Phase 4). No native code, no new dependencies and no change to `src/` ship with it.

## Goal

The plan row (`docs/consolidation/PLAN-ADDENDUM.md` § 4, row 10): "Health context". What exists: "Manual
bodyweight and girths (`body.tsx`)". What it needs: "Apple Health / Health Connect read; overlays in
Chronicle; no score". Depends on: "Capacitor". Risk: "Native permissions; never a readiness score".
`docs/STATUS.md` § 4 row 10: "Health context: bodyweight, sleep, HRV overlays in Chronicle, no readiness
score".

In plain terms: with the lifter's permission, read bodyweight, sleep and heart rate variability from Apple
Health (iOS) or Health Connect (Android), and show them beside the training record in the Chronicle as
context. Lock'd never combines them into a score, a "ready" state or advice to train or rest.

## What exists today

- **Manual body measurements.** `BodyMeasurement` in `src/domain/types.ts`: `id`, `metric`, `value`,
  `displayUnit` (`kg`, `lb`, `cm`, `in`), `recordedAt`, `localDate`, `note`, `createdAt`, `updatedAt`.
  `MeasurementMetric` is `bodyweight` plus girths (sided, and unsided `arms`, `thighs`, `calves` per D13).
  `metricKind` in `src/domain/taxonomy.ts` says `bodyweight` is mass and every other metric is length.
- **Canonical values.** `src/routes/body.tsx` stores bodyweight in grams (`toGrams`) and girths in
  millimetres (`toMillimetres`); the page says "stored as integers. Units are display-only." Entry is by
  `addMeasurement` in `src/lib/gym/store.ts`.
- **Validation.** The backup schema (`src/lib/backup/schema.ts`, `measurement`) checks the metric against
  the enum, the value range and the display unit.
- **Import.** `src/lib/import/batch.ts` adds measurements from backups and skips ones already recorded,
  keyed by `metric|recordedAt|value`.
- **Readers of bodyweight.** `relativeStrength` (`src/domain/relativeStrength.ts`) picks the latest
  bodyweight on or before the e1RM's date; the lift page (`src/routes/library_.$id.tsx`) shows it with its
  date. `src/lib/gym/intelligence.ts` uses the latest bodyweight for relative lifts; `src/lib/gym/wrapped.ts`
  reads the year's bodyweight rows.
- **Chronicle.** `buildChronicle` (`src/lib/gym/chronicle.ts`) builds eras and events from sessions only.
  `src/routes/chronicle.tsx` shows the current era, the eras rail and events. There is no chart and no body
  or health data on the page today.
- **Sync and shares.** The cloud vault payload (`src/lib/cloud/payload.ts`) includes `measurements`. The
  read-only history link leaves body measurements out (`src/lib/cloud/history-link.ts` comment).
- **No recovery score exists.** `src/lib/gym/recovery.ts` states "not a recovery score: there is no 'fresh'
  or 'ready'". No sleep or HRV type exists anywhere in `src/`. No native project exists yet.

## Design

1. **Read only, opt in, per type.** A Settings row "Health context" (native build only) asks for read
   permission for bodyweight, sleep and HRV separately. Nothing is written back to the health store. The
   web build shows nothing and asks nothing.
2. **Bodyweight** arrives as ordinary `BodyMeasurement` rows with `metric: "bodyweight"`, so every existing
   reader (relative strength, Wrapped, the Body page) works unchanged. Each row carries where it came from
   (see Data and storage), and the Body page labels imported rows with the source.
3. **Sleep and HRV** are not body measurements (they are neither mass nor length), so they get their own
   collection of samples rather than new `MeasurementMetric` values that `metricKind` would misread.
4. **HRV is kept per method.** Apple Health reports SDNN; Health Connect reports RMSSD. They are different
   measures and are never merged or compared with each other. Each sample stores its method and the overlay
   labels it.
5. **Sync on open.** When the app opens (and on a manual "Read now"), it reads samples since the last
   anchor, de-duplicates by the source's sample id, and applies them as one batch through the store, like an
   import. It never runs during a set.
6. **Chronicle overlays.** Each era card can show a small, separate line per type for that era's date range:
   bodyweight at the era's start and end (with dates), the nights of sleep on file and their median, and HRV
   samples on file and their median, each with its count. Missing data reads "no sleep data for this era",
   never zero and never a good or bad colour. Overlays sit below the training numbers and are toggled off by
   default (open question).
7. **No score, no verdict.** No readiness, recovery or strain number, no "train today" advice, no colour
   that reads as good or bad, and no claim that sleep or HRV caused a result. The weekly verdict, progression
   and Chronicle era detection do not read health data.
8. **Receipts.** Each overlay number opens the samples behind it (date, value, source), in the spirit of
   Opp 4. Any threshold (for example the fewest nights before a median is shown) is a named constant with an
   `implementation_heuristic` claim in `src/domain/evidence/catalog.ts`.

## Data and storage

- **Bodyweight:** grams, as today. New optional fields on `BodyMeasurement`: `source` (for example
  `manual`, `apple_health`, `health_connect`; absent means manual) and `sourceId` (the health store's sample
  id, for de-duplication). Both optional, added in `src/domain/types.ts`, the zod `measurement` schema in
  `src/lib/backup/schema.ts`, and export/import, with an old-format fixture and a round-trip test.
- **A new optional collection** `healthSamples`: `id`, `kind` (`sleep` or `hrv`), `method` (for HRV:
  `sdnn` or `rmssd`), `value` (sleep in whole seconds asleep; HRV in whole milliseconds), `startAt`,
  `endAt`, `localDate`, `source`, `sourceId`, `createdAt`. Optional in the backup schema (like
  `optionalRows` for programs), so every existing backup loads. It needs a Dexie table and a migration in
  `src/lib/storage/`, with a test.
- Nothing derived is stored: medians and counts are computed on read.

## Principles check

- **Logging speed:** reading happens on app open or on request, never in the set flow.
- **History as the source of truth:** samples are stored as raw readings with their source; every overlay
  is derived on read.
- **Number honesty:** each figure shows its count and source; missing data stays visible; SDNN and RMSSD
  are never mixed; no score is invented.
- **Guest and offline:** reading is on-device and needs no account. Guests get it in the native build.
- **One codebase:** the React app renders overlays; native code only reads samples through a plugin
  interface with a web no-op.
- **Brand:** permission prompts and copy say "Lock'd".

## Open questions for the owner

1. Should health samples sync to the cloud vault, stay on the device only, or be a separate choice?
2. Overlays on by default, or off until the lifter turns them on?
3. The fewest samples before a median is shown, per type.
4. Sleep: total time asleep only, or also time in bed? Which night does a sleep belong to (the date it
   ended is one option)?
5. How far back to read on first permission: all history the store has, or a limit?
6. If a manual bodyweight and a Health bodyweight fall on the same day, which one does `relativeStrength`
   pick, or does it keep today's latest-`recordedAt` rule?
7. Resting heart rate or steps: out of scope, or later?
8. Should the watch (Opp 7) ever be a source?

## Out of scope

- Any native code, Capacitor setup or new package (this is a design doc).
- Any readiness, recovery or strain score, and any advice drawn from health data.
- Writing workouts or bodyweight back to Apple Health or Health Connect.
- Correlations such as "best lifts after long sleep" (a separate decision, if ever).
- Health data in public shares or the read-only history link.
