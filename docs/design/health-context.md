# Health context (Opp 10)

Status: TypeScript side built (Phase 4). The native half of `LockdHealth` is written (HealthKit on iOS, Health Connect on Android) and compiled in CI. It has not been run against a real Health store.

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

## Owner's answers

Recorded 2026-09-30. The owner accepted the recommended answer on all eight.

1. **Cloud vault:** health samples (sleep, HRV) stay on the device and go in backups only. They are not in the cloud vault payload.
2. **Overlays:** off until the lifter turns them on (Settings, "Show in the Chronicle").
3. **Fewest readings before a median:** 3, per type (`HEALTH_MIN_SAMPLES`), and for HRV per method.
4. **Sleep:** time asleep only. A night belongs to the date it ended.
5. **First read:** the last 365 days (`HEALTH_FIRST_READ_DAYS`); later reads start a day before the newest reading of that type.
6. **Same-day manual and Health bodyweight:** `relativeStrength` keeps its latest-`recordedAt` rule, unchanged.
7. **Resting heart rate and steps:** out of scope.
8. **Watch as a source:** no.

## What is built

- `src/domain/health.ts`: `eraHealthOverlay` (counts, medians and the readings behind them for an era's date range), `HEALTH_MIN_SAMPLES`, `formatAsleep`. Pure; nothing derived is stored.
- Storage: `BodyMeasurement.source` and `sourceId` (optional), `HealthSample` and `healthSamples` (optional in `GymData` and the backup, empty by default), a Dexie table added in database version 4, `settings.health` (which types are on, and the overlay switch). The `localStorage` copy leaves an empty `healthSamples` out, so a lifter with no readings keeps the exact format earlier builds wrote and read.
- `src/lib/native/health.ts`: the `LockdHealth` plugin contract with a web no-op, and the pure `planHealthImport` (reads each sample once by the health store's own id; a sleep night is updated when more sleep arrives for it). `src/lib/native/health-sync.ts` reads on app open and on "Read now", one batch, never during a set.
- Screens: a Settings "Health context" section (native build only), a Chronicle overlay under each era with a receipt of the readings behind each number, and a source line on the Body page.
- Bodyweight read from Health is stored as ordinary bodyweight rows, so every existing reader works unchanged. Each carries its `source` and **stays out of the cloud vault** (owner's decision, 2026-09-30, which reversed the first answer): `cloudGymFromState` leaves out any row that has a `source` (typed rows have none), and a pull from the vault (`replaceFromCloud`) keeps this device's Health rows. Typed entries still sync. On the device nothing changes: `relativeStrength` keeps its latest-`recorded` rule over typed and Health rows alike. Sleep and HRV never sync either. The Settings copy says so.
- The evidence catalog has a claim for the 3-reading minimum (`health-overlay-min-samples`).

## Native half

- **iOS** (`ios/App/App/Native/LockdHealthPlugin.swift`, `SleepIntervals.swift`): read-only HealthKit queries for bodyweight, sleep and HRV. Asleep stages are raw values 1, 3, 4, 5; overlapping intervals are merged so a night is not double counted. HealthKit never reveals whether a read was denied, so `requestAccess` reports every requested type as granted and an empty result reads as "no data". `App.entitlements` carries the HealthKit capability; `NSHealthShareUsageDescription` is in `Info.plist`. `scripts/native/add-healthkit.rb` wired the files into the project.
- **Android** (`LockdHealthPlugin.kt`, `SleepIntervals.kt`, `HealthPermissionsRationaleActivity.kt`): Health Connect `connect-client:1.1.0-beta01` (1.1.0 needs AGP 8.9.1 and compileSdk 36; ours are 8.7.2 and 35). The library needs minSdk 26 and the app keeps 23, so the manifest overrides the library's minSdk and the plugin returns "unavailable" below API 28. Permissions: read weight, sleep, HRV and read-history. Asleep stages are 2, 4, 5, 6; a session with no stages counts as asleep for its whole duration. A rationale activity and alias are declared as Health Connect requires.

## Checks

| Check | Status |
|---|---|
| Code written | iOS and Android |
| Compile check | CI jobs `ios` and `android`. Android also runs the sleep-interval unit tests (3) |
| Device check | **Not run.** The permission flow, real samples, sleep stage handling, and whether a long history reads quickly |

## Needs the owner

- **Apple:** a Developer account and team, and the HealthKit capability enabled on the App ID `com.happyharris.lockd`. The simulator build is unsigned, so the entitlement is not exercised there.
- **Google:** a Play Console account, the Health Connect permissions declaration and its review before release. A debug build on a device works without it.

## Out of scope

- Any native code, Capacitor setup or new package (this is a design doc).
- Any readiness, recovery or strain score, and any advice drawn from health data.
- Writing workouts or bodyweight back to Apple Health or Health Connect.
- Correlations such as "best lifts after long sleep" (a separate decision, if ever).
- Health data in public shares or the read-only history link.
