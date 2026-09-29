# Handover log

State, most recent first. Read at the start of a session. Append an entry at the end of each PR:
what shipped, what it means for the next session, and anything not verified. This is a log, not a
doc to rewrite.

## Log

### 2026-09-29 — Plan PR 7b: the import pipeline, and the Strong importer rebuilt on it

- **`src/lib/import/`:** `csv.ts` (RFC 4180 parser, delimiter detection, BOM, escaped export cells),
  `parse.ts` (numbers with decimal commas or thousands marks, durations, day-first and named-month
  dates; blank or unreadable stays missing, a date that rolls over is refused), `engine.ts` (source
  profiles, header auto-mapping with hand overrides, weight and distance unit detection, grouping
  rows into sessions, and the session fingerprint), `batch.ts` (builds an `ImportJob` plus
  everything to add without writing anything; `applyImportBatch` adds it; `storedFingerprints`
  recognises sessions already in the log, including ones imported before fingerprints existed;
  `findExerciseCandidates` is for the wizard), `strong.ts` (the Strong profile).
- **Rules kept:** blank cells stay missing; the only automatic exercise merge is the exact
  normalised name; near matches are suggestions only; a name nobody matched becomes a custom
  `unmapped` exercise (no silent muscle mapping). Re-importing a file adds 0 sessions. The
  session's wall-clock stamp is stored as read, and `tzOffsetMinutes` keeps its raw sign.
- **Removed:** the old parser and `buildStrongImport`/`matchExercise` in `src/lib/gym/csv.ts`
  (`exportSetsCsv` stays; 7f rewrites it). The old fuzzy word-overlap matching that merged different
  exercises is gone.
- **Characterisation:** the European-file BUG test now pins the correct reading (2026-02-03,
  110 kg, 5 and 3 reps). The standard file and export are unchanged in the snapshot.
- **Tests:** 60 unit tests in `strong.test.ts` (parsers, three fixtures copied from Strong-Pro,
  mutation-checked), and `e2e/import-csv.spec.ts` (Settings import of the European file, then again
  adds 0).
- **Settings:** the note now reports skipped rows, duplicate sessions left out and new exercises to
  classify. The wizard (mapping screen, Resolve, Bulk Classify) is 7e.
- **Next:** 7c Hevy on this engine; recheck Hevy's own export docs before shipping.
- **Not verified:** real Strong exports beyond the three fixtures; a negative weight becomes 0 with
  a warning (assisted lifts are not inferred).

### 2026-09-29 — Plan PR 7a: backups are checked before they are restored

Plan PR 7 (data portability) is split. **7a (this):** validate and safely restore `lockd-backup`
files. Still to come: 7b the common import pipeline (fingerprints, dedupe, `ImportJob`) with the
Strong CSV importer rebuilt on it (European files, time-zone sign); 7c the Hevy importer (contract:
`docs/consolidation/HEVY-IMPORT.md`); 7d importers for `repforge-backup` v1 and the knurl-os vault;
7e the wizard with Resolve and Bulk Classify; 7f the CSV exporter and the seed library top-up.

- **Before:** Settings did `JSON.parse` and a format check, then merged straight into the log. A
  malformed file threw with no message, a bad value went into the log unchecked, and nothing was
  copied first.
- **`src/lib/backup/schema.ts` (Zod 4):** every collection and setting is checked. Unknown keys are
  dropped, text is bounded, grams, reps, seconds and metres must be whole and in a real range,
  `tzOffsetMinutes` must be whole minutes within a day (its sign is never touched), dates must be
  dates, enums must be known values (the runtime lists fail to compile if a union in `types.ts`
  drifts). Rows must point at rows that exist and ids must be unique. A file that fails is refused
  with the first eight reasons and where they are; **nothing is repaired or dropped silently**.
  Backups from a newer app version are refused with that reason. Older backups load: missing
  collections come back empty (a test loads the pre-type-union fixture from 5's work unchanged).
- **`src/lib/backup/apply.ts`:** takes a `before-restore` safety copy first and changes nothing if
  it cannot. Settings now has two inputs, **Add a backup to this log** (merge) and **Replace this
  log with a backup**; each says what is in the file and asks first. The result is a toast
  ("Added 12 sessions", "Nothing new", "Replaced your log…").
- **Tests:** `schema.test.ts` (round-trips a real export of the 137-session sample log, prototype
  pollution keys, every refusal above, and the restore order) and `e2e/backup.spec.ts` (refuses junk
  and a bad value with the reason, merging a log into itself adds nothing, replace keeps a copy,
  declining changes nothing).
- **Not done here, decided later in 7:** foreign formats, the wizard, and what "merge" should do
  about a session that exists on both sides with different contents (today: the row already here
  wins, as before).

### 2026-09-29 — Plan PR 6b: the service worker (closes plan PR 6)

Full description: `docs/OFFLINE.md`.

- **The app opens and works with no network.** `/sw.js` is built after the app
  (`scripts/build-sw.mjs`; bundled by Vite from `src/sw/worker.ts`), caches every file in the build
  plus an app shell, serves build files from the device, and opens the shell when a navigation
  fails, takes over 3 s or gets a 5xx. It never touches server data calls, non-GETs, other origins,
  or `/s/*`, `/u/*`, `/login`. Decision on tooling (the plan's spike): **hand-written worker, no
  Workbox and no vite-plugin-pwa**, because Vite 8's bundler has no esbuild and the worker is small
  enough to test directly. The pure routing rules are in `src/sw/routing.ts`.
- **The shell is fetched without cookies**, so it is always the guest page. It hydrates for any
  screen because `GymGate` draws only the splash until the log has loaded, on the server and on
  the client alike. **Verified**, not assumed: the e2e opens `/history` and `/chronicle` cold and
  offline from the shell.
- **Updates wait for the lifter** (SP #35's fix): the new worker installs, the app says "A new
  version is ready", and only Reload makes it take over (`SKIP_WAITING`, then reload on
  `controllerchange`). The first install shows no prompt. Old caches are deleted on activation.
- **Bug found by a unit test:** a prefix check would have treated `/login-help` as a public
  screen. Screens are now matched as whole folders.
- **CI** now also runs `npm run test:e2e:offline` (builds, then `e2e-offline/` against
  `vite preview`). The update test swaps the built `sw.js` on disk, because Playwright cannot
  intercept the browser's own check for a new worker script.
- **Limits.** (1) Every new build re-downloads the whole cache (about 1.7 MB); reusing unchanged
  hashed files across versions would fix it. (2) A screen that needs the server (Locker, cloud sync)
  shows what it shows with no server; only the guest path is proven offline. (3) The worker is not
  registered in dev. (4) No install-prompt UI was added; the manifest is what makes the app
  installable.
- Remaining in plan § 6 and § 5: the `grok.com` script comes out with the scaffolding (PR 12).

### 2026-09-29 — Plan PR 6a: what the app needs to run offline, apart from the service worker

The offline plan (PLAN § 6) is split: **6a (this)** removes the things that reach out or break
offline; **6b** adds the service worker, the update prompt and the offline cold-start e2e.

- **Fonts are served by the app.** Barlow, Barlow Condensed and IBM Plex Mono (Latin, woff2 only,
  from `@fontsource/*`) via `src/fonts.css`; the Google Fonts links and preconnects are gone. Same
  faces, same names, so nothing looks different. Licences: `docs/FONTS.md` (OFL 1.1). The identity
  PR replaces them.
- **Own manifest and icons.** `public/manifest.webmanifest` (name Lock’d, standalone, 192, 512 and
  maskable 512) and `apple-touch-icon.png`, rendered from the current `favicon.svg` "L" mark (the
  identity PR redraws them). The root route links these instead of `/__grok/manifest.webmanifest`
  and `/__grok/icon-180.png` (the latter was never in the repo). The scaffolding's head injector
  used to add its own manifest link on deploys; it now skips a page that already has one (legacy
  test added; that suite already has 7 unrelated failures on `main`, unchanged).
- **The session lookup no longer breaks offline.** The root route calls a server function on every
  navigation to ask who is signed in. Offline that threw and showed "Something went wrong". It now
  carries on as a guest when the failure is a network one, and still throws real server errors.
  The e2e fails without this change.
- **Found, not fixed (owner call): the app loads a script from `https://grok.com` on every page.**
  The scaffolding's head injector adds `https://grok.com/grok-app-builder/extensions.js`, in dev and,
  through the Nitro middleware, on deploys. It is a third-party script running with access to the
  page (so to the log). It goes with the scaffolding in plan PR 12, but consider moving that up. The
  new e2e exempts exactly that URL, so anything else that reaches another origin fails it, and the
  exemption comes out with PR 12.
- **Known gap for 6b:** navigating offline to a screen never opened before fails, because route
  code is split and only visited routes' chunks are on the device. The service worker precaches them.

### 2026-09-29 — Plan PR 5e: tabs stay in step

- Closes plan PR 5. After each successful write a tab announces it on `BroadcastChannel('lockd-log')`.
  A tab that hears it applies the same rows to its own store (`applyChangeSet`, the row-level inverse
  of `diffSlices`) and moves its write baseline forward, so it **does not write them back** (no
  echo, no loop). A whole-log replace (delete everything, restore, taking the cloud copy) is
  announced as `replace`, and the other tab reloads from the database after its own pending writes.
  Settings and the rest timer are documents and travel the same way.
- **Two tabs no longer clobber each other.** Under `localStorage` the last writer replaced the whole
  log; now writes are per row, and two edits to different rows at the same time both survive.
- **Known limits.** The same row edited in two tabs at once is last-writer-wins. A tab that is in the
  middle of loading a `replace` can lose a local change made in that instant from its screen (the
  database still has it). Both need two tabs and very tight timing.
- **Tests.** Seven unit tests run two real copies of the app's modules on one database and check:
  a change appears in the other tab and is not echoed, both directions without looping, edits to
  different rows at the same time, settings and the timer, and a replace. Two mutations (baseline not
  moved, no announcement) each fail 4 to 5 of them. One e2e opens two pages in one browser context.
- Remaining from plan § 4: deleting the old `lockd-v1` key (a separate PR, 30 days and three good
  boots after release), and the SQLite adapter for Capacitor (later).

### 2026-09-29 — Plan PR 5d: durable storage is live

**The app now saves to the `lockd` database, not `localStorage`.** Read this entry before touching
storage.

- **Boot** (`src/lib/storage/boot.ts`, called from `GymGate`): runs the migration (5c), loads the
  log into the store, then a change subscriber writes only what changed. Changes in one tick share
  one write; writes are chained so they arrive in order; a failed write is retried with the next
  change and shows a notice. A change that removes more than 500 rows (delete everything, restore,
  taking the cloud copy) is stored as `replaceAll`, because a bulk key-by-key delete of a 5-year log
  took about 7 s. `flushWrites()` waits for the queue (tests, reload, erase).
- **`localStorage['lockd-v1']` is never written again and never deleted by the app**, except by
  "Delete local cache" (below). `persist` stays in the store as the fallback for one release, with
  a switchable backend (`backend.ts`): `dexie` (persist does nothing), `local` (the old path, when
  there is no IndexedDB or the copy did not verify), `frozen` (unreadable log and nowhere to keep a
  copy: nothing is written).
- **Logging gets cheaper, not dearer.** The backend is a `PersistStorage`, not `createJSONStorage`,
  because the latter `JSON.stringify`s the whole log on every store update before the backend is
  asked, even when it writes nothing. Now only the `local` fallback serialises.
- **Decision for you: an unreadable old log.** The plan said "boot from the old path and show a
  recoverable error". That path would overwrite the string on the next write. Instead: the raw string
  is kept in `safetyBackups` (Settings, Safety copies, Download as `lockd-raw-log-….json`), the
  `localStorage` key is left as it is, a **new log starts in the database**, and a notice says so.
  Reversible: the notice text and behaviour are one function in `boot.ts`.
- **Schema v3** drops the two secondary indexes on `workoutSets` and `workoutExercises`. Measured in
  Chromium with a 15,000-set log: writing it took 14.4 s with them and 2.8 s without; nothing queries
  by them. v2 is untouched (a v3 block removes them), with a test that upgrades a real v2 database.
- **Numbers, measured** (Chromium, 4x CPU throttle, dev server): reading a 15,000-set, 822-session log
  takes 325 to 425 ms (plan budget 500 ms), asserted in e2e as best of three. The 137-session sample
  log takes about 125 ms. Writing that big log the first time (the one-off migration) takes about
  3.5 s. **Not storage, but noticed:** rendering the home screen with the big log adds about 600 ms at
  4x, from the engines running on render. `BootResult.readMs` stops before the store is set on
  purpose, so that cost is not blamed on storage.
- **Splash for guests too.** Everyone now waits for the log to load (a guest could tap "Start empty"
  before the load finished and have it overwritten). It is a fraction of a second.
- **Settings:** the pre-move copy is listed with **Restore** (takes a `before-restore` copy of the
  current log first) and Download. **Delete local cache now also deletes the old `localStorage` copy
  and every safety copy**, since those are full copies of the log.
- **Known limit:** writes are asynchronous. Closing the tab within a few milliseconds of a change
  could drop that change, where `localStorage` was synchronous. Nothing here waits on `pagehide`.
- **Not in this PR:** cross-tab reload (`BroadcastChannel`). Two tabs write row by row now, so they
  no longer overwrite each other's whole log as they did, but a tab does not see the other's changes
  until it reloads. That is 5e. Deleting the old key stays a separate PR (30 days, three good boots).
- e2e specs that read `localStorage` now read the database (`readLog` in `e2e/helpers.ts`). New
  `e2e/storage.spec.ts`: migration leaves the old copy byte-identical, the budget, an unreadable log,
  delete-everything.

### 2026-09-29 — Plan PR 5c: the migration runner

- **Still not wired.** `src/lib/storage/migration.ts` is `runMigration({ repo, storage, freshData })`;
  5d calls it from `GymGate`. It only ever **reads** `localStorage['lockd-v1']` (tests hand it a
  storage that throws on anything but `getItem`) and never deletes it.
- **The order is the safety story** (PLAN § 4): already migrated → load from the database; no old
  payload → seed a fresh log; unreadable payload → **do nothing at all**; keep the raw string in
  `safetyBackups` (`pre-migration`, `format: "raw-localstorage"`) before any row is written; write
  every collection in one transaction; read it back and compare a checksum (counts per collection,
  plus a hash over each set's `(id, weightG, reps, durationSeconds, distanceM, isCompleted)` and
  each workout's `(id, status, localDate)`); only then record `meta.migratedFrom`,
  `migratedAt`, `sourceChecksum`. A crash before that last step re-runs safely.
- **Outcomes** (`MigrationResult`): `already-migrated`, `fresh`, `migrated`, `corrupt` (carries the
  raw string so Settings can offer "download raw data"), `verify-failed` (new tables emptied; keep
  running from `localStorage`). It runs under `navigator.locks` (`lockd-migrate`), so two tabs
  migrate once; without the Locks API it still works, just not serialised across tabs.
- **Both 5a findings are handled:** a corrupt payload is left exactly as it was (no seed, no write,
  no meta), and collections an old payload lacks come from fresh data (`withFreshDefaults`), the
  same way zustand's merge does today.
- The port gained `rawSafetyCopy`. `freshData()` is now exported from the store (no change).
- **38 tests**, run on both repositories and all six persisted fixtures, including the 137-session
  sample log; corrupt variants; two tabs at once; a crash before the meta; a lossy copy. Four
  mutations (skip the raw copy, skip verification, seed over a corrupt payload, write meta before
  verifying) each fail the suite.
- **Not covered here:** the Settings restore ("restore the copy taken before the move") and the
  "download the copy" link are 5d. Deleting the old key is a separate later PR (30 days and three
  successful boots).

### 2026-09-29 — Plan PR 5b: Dexie schema v2 and the `LockdRepository` port

- **Nothing reads or writes the new tables yet.** The app still persists to `localStorage`; this
  adds the database and the seam. The switch-over is 5c (migration) and 5d (wiring).
- `src/lib/storage/db.ts` owns the IndexedDB database `lockd`. **Version 2** adds the log tables
  from PLAN § 4 (`exercises` … `clips`), `kv` (settings, restTimer, labLast), `meta`, and a
  device-only `device` table (reserved for text size; never synced or in the cloud vault). Version
  1's `safetyBackups` is untouched; a test opens a genuine v1 database and checks its rows survive.
  Deviation from the plan's table: `isCustom` and `isArchived` are **not** indexed, because
  IndexedDB cannot key on a boolean. `safety.ts` re-exports the class and helpers, so callers are
  unchanged. `SafetyReason` gains `pre-migration` and `before-restore`, and a copy can be the raw
  `localStorage` string (`format: "raw-localstorage"`).
- `repository.ts` is the port: `load`, `apply(ChangeSet)`, `replaceAll`, `importBatch`,
  `safetyBackup`, `meta`, `setMeta`, plus `diffSlices(prev, next)`, which compares **by reference**
  so an edited set is a one-row write. Two implementations: `DexieRepository` and `MemoryRepository`.
  A SQLite adapter for Capacitor implements the same seven methods.
- **Atomic:** `apply` and `replaceAll` validate every key first and use one Dexie transaction, so a
  bad row stores nothing (tested against both implementations). `importBatch` writes in batches of
  1,000 inside one transaction (tested with 5,500 rows).
- **Tests (48 in `src/lib/storage`)**: one contract suite run against both implementations, on the
  real fixtures including the 137-session sample log; and a test that drives the **real store**
  through a whole session (start, edit, complete, delete, add, finish, change a setting, import a
  workout), applies each diff to a repository, and checks it reproduces the store after every step.
  Two mutations (drop removals in `diffSlices`; drop `bulkDelete` in Dexie) each fail.
- **Next, 5c:** the migration runner (`navigator.locks`, raw safety copy first, one transaction,
  checksum verify, `meta`), with the two findings from 5a built in (merge over fresh data; never
  overwrite a corrupt payload).

### 2026-09-29 — Plan PR 5a: pin the `localStorage` format before moving off it

- **No behaviour change.** The store's persisted format (`lockd-v1`, version 3, the 21-field slice)
  and its `migrate` step are extracted unchanged into `src/lib/storage/persisted.ts`
  (`PERSIST_KEY`, `PERSIST_VERSION`, `persistedSlice`, `migratePersisted`). `defaultSettings` moved
  to `src/lib/gym/settings.ts` (re-exported from the store) to avoid an import cycle. The Dexie
  migration (5b onwards) reads old payloads through these, not through the store.
- **Fixtures first** (`src/test/fixtures/persist/`, see its README for how each was made): two
  payloads **captured from the running build** (the sample log, 1.1 MB; an active workout with 8 of
  16 sets done and the rest timer running), one generated by driving the real store (imperial units,
  custom exercise, Strong CSV import, machine setup, lesson, named era), reconstructed v1 and v2
  (best effort; the true old shapes are not on file), an empty-state and a corrupt payload. A clip
  fixture is not included: a clip needs a recorded video.
- **17 tests** run the real store against an in-memory `localStorage`: every v3 payload loads and is
  written back parsed-equal; the active workout resumes with the same rest-timer end; v1 and v2 are
  upgraded and rewritten as v3. Three mutations (drop a persisted field, bump the version, stop
  backfilling `clips`) each fail the suite.
- **Found, pinned as `BUG:`, fixed in the migration PRs:** a corrupt `lockd-v1` string is not
  loaded, `hydrated` never turns true on its own, and the **next write replaces it**. A guest who
  taps "Start empty" destroys a payload that could have been recovered. Plan § 4 step 3 already
  says "do not migrate, do not delete, do not seed over it"; the runner must honour it.
- **Also pinned:** `migratePersisted({})` does not backfill the core collections (`exercises`,
  `workouts`, …). Today zustand merges the result over fresh data, which hides it. The migration
  runner has to merge over fresh data the same way, or it will write undefined collections.
- Remaining plan PR 5 slices: 5b Dexie schema and the `LockdRepository` port with an in-memory
  implementation; 5c the migration runner (lock, safety copy, single transaction, checksum verify,
  meta); 5d wiring (boot in `GymGate`, coalesced writes, `BroadcastChannel`, Settings restore, boot
  budget in e2e).

### 2026-09-29 — History "Sets" counts every set after warm-up

- **Decision (mine, as the owner asked me to judge):** a label must not promise more than the
  number counts. History rows and the history detail said "Sets" but showed working sets only, so a
  session with 3 working sets and a drop set read "3 sets". They now show `completedSetCount`: every
  completed non-warm-up set, any tracking type. The session receipt keeps **"Hard sets"**
  (working-only, honest as labelled), and the verdict, eras, Chronicle, Wrapped and the public
  share payload keep `hardSetCount`. Nothing stored changes.
- The table at the top of `volume.ts` now lists all four measures. The shared receipt's `hardSets`
  field is untouched on purpose: it is part of the public share payload.
- `CODEX-HANDOFF.md` stays out of the repo (owner's call).

### 2026-09-29 — Plan PR 4g: evidence catalog (closes plan PR 4)

- `src/domain/evidence/` (types, catalog, index) is Strong-Pro's structure, but **only claims for
  behaviour Lock'd has today**. Six sources, seven claims. Every DOI was resolved against Crossref
  and both PMIDs against PubMed; ACSM's "≥10 sets/wk" and Pelland's fractional-set (0.5) result
  were read from the abstracts. Epley 1985 has no DOI (pre-1990).
- **Not carried across, on purpose** (Lock'd doesn't do these yet, so a claim would describe
  something the app doesn't): the 10–20 weekly band, deload-shape and spike flags, the stall flag,
  personal muscle targets, double progression, proximity-to-failure (Refalo 2023 is left out with
  it). Each comes across with the feature that needs it (plan PR 8 for the flags and targets, PR 9
  for RIR). Strong-Pro's copy also said secondary credit was user-editable; here no screen edits it.
- **New Lock'd claims:** `weekly-volume-dose-response` (why weekly sets per muscle are shown; context
  only), `volume-landmarks-defaults` and `weekly-verdict-direction`. **Finding:** the MEV/MAV/MRV
  numbers on the home screen and the ±10% verdict band have no study behind them. They are now
  labelled as product heuristics with no sources, which is what they are. Nothing on screen changes.
- Tests (11): integrity, every source cited, DOI shape, heuristics never posing as research, no
  former brand names, and three that fail if the code moves under a claim (rep cap, formulas,
  default credit). Nothing in the UI reads the catalog yet; the "show the working" sheets are PR 8.
- **All seven slices of plan PR 4 are written** (4a–4g; #9, #10, #11 and this one may still be open).

### 2026-09-29 — Plan PR 4f: `types` union

- `src/domain/types.ts` gains Strong-Pro's fields, **all optional**, so nothing stored changes shape:
  `WorkoutSet.rir` / `side` / `pairId`, `WorkoutExercise.unilateralSnapshot`,
  `TemplateExercise.targetRir`, `Workout.importFingerprint` / `importJobId`,
  `AppSettings.personalMuscleTargets` / `restTimerVibrate` / `restTimerNotification`, and
  `IntensityMode` gains `"rir"` (D17). Also `MuscleTargetBand`, `PersonalMuscleTargets`,
  `ImportJob`, `ImportIssue`, `ImportJobStatus` and `ImportSource`.
- **Deliberately not merged:** Strong-Pro's `GoalLens` (3 values; Lock'd keeps its 6),
  `AccentTheme` `violet` and `AppIcon` (not decided), and its `id: "settings"` / `"rest-timer"` /
  `"meta"` singleton rows (a Dexie concern; plan PR 5). Lock'd's `Workout.tzOffsetMinutes` keeps
  its sign (see the comment on the field).
- **Nothing reads the new fields yet.** RIR entry is plan PR 9, unilateral logging is PR 9, the
  import fingerprint is PR 7, muscle targets are PR 8. `ImportSource` is provisional until PR 7.
- Tests: `backup-fields.test.ts` loads a hand-written backup from before this change
  (`src/test/fixtures/backup/lockd-backup-v3-before-type-union.json`) and checks it is unchanged,
  and that every new field survives import and export. No stored-data migration is needed.

### 2026-09-29 — Plan PR 4e: `exerciseTaxonomy`

- `src/domain/exerciseTaxonomy.ts` is Strong-Pro's module, unchanged apart from formatting:
  `suggestExerciseTaxonomy(name)` proposes a primary muscle, equipment and movement pattern from an
  exercise's name, or returns `null`. Strong-Pro's 40 tests are ported; 4 new ones pin the Lock'd
  contract (`exerciseTaxonomy.lockd.test.ts`).
- **It only suggests.** Nothing calls it yet. The Strong and Hevy importers (plan PR 7) must show
  the result for the lifter to confirm before saving; an unrecognised name stays `unmapped` (number
  honesty: no silent muscle mapping).
- Measured against the 66-exercise seed library: 49 names get a suggestion and 47 match the seed's
  muscle. The two that differ are judgement calls (Sumo Deadlift: glutes in the seed, hamstrings
  suggested; Close-Grip Bench Press: triceps in the seed, chest suggested), pinned in a test. With
  no equipment word in the name (`Back Squat`) it says `other`, not a guess.
- No behaviour change anywhere in the app; all characterisation snapshots unchanged.

### 2026-09-29 — Plan PR 4d: `records` (I-12, first-exposure PRs)

- **Fixed I-12:** the first time a lift is on file is its baseline, never a PR. Before, the demo
  log's first session reported 4 PRs (one per lift) and every imported lift would have opened with
  a fake PR. Applied in both places that stamp PRs: `detectPrsForWorkout` (session receipt, history
  detail, finish toast) and the Chronicle's running e1RM stamps (PR runs).
- **Reviewable snapshot diff** (`engine-characterisation`): the longest PR run goes from 156 stamps
  starting 2025-10-06 to 143 starting 2025-10-13, and the Feb 2026 run from 81 to 80. Nothing else
  moved. `records.test.ts` pins the rule; its first commit pinned the old behaviour as `BUG:`.
- `src/domain/records.ts` is Strong-Pro's module (weight, e1RM, set-volume and rep-bracket
  records) with the same first-exposure rule, plus one more fix: a rep record now respects earlier
  sets in the same session (Strong-Pro compared only against history). 8 tests, none ported
  (Strong-Pro had none). Lockd's engines still use their own e1RM-only detection; moving them onto
  this module is plan PR 8.
- **Not fixed, noted:** `completeSet` calls `detectPrsForWorkout`, but the workout is still `active`
  and `sliceSessions` only holds completed sessions, so the mid-workout PR toast never fires. The
  domain `findNewRecords` is built for that; wiring it in belongs with the logging work (plan PR 9).

### 2026-09-29 — Plan PR 4c: `volume`

- `src/domain/volume.ts` is Strong-Pro's module (tracking-aware tonnage, `totalsForGroups`,
  `attributeVolumeByMuscle`, `clampCredit`, `isoWeekKey`, `monthKey`) plus Lockd's
  `hardSetCount`, `countsForVolume` and `attributeMuscleVolume`. Strong-Pro's 15 volume tests
  are ported; 13 new tests (`volume.lockd.test.ts`, `src/lib/gym/tonnage.test.ts`).
- **Fixed, with fixtures that fail against the old code:** (1) tonnage counted assisted-weight sets
  (the *assistance*, not the load lifted: 40 kg assist × 8 = 320 kg of "tonnage"); (2) reps-only,
  duration and distance sets counted if a weight was recorded; (3) the "include warm-ups" option
  never worked (`setTonnageG` returned 0 for a warm-up regardless; every caller passes `true`, so
  it was latent); (4) a NaN secondary credit turned every attributed number into NaN.
  `workoutTonnageG` (analytics.ts) is the single tonnage entry point and is now tracking-aware. A
  set whose exercise row is missing is no longer counted (no tracking type to judge it by).
- **No number changes for the demo log** (no assisted sets there), so every characterisation
  snapshot, including the verdict's tonnage, is unchanged. Real logs with assisted or
  recorded-weight bodyweight sets will see lower tonnage; that is the fix.
- The three set measures are documented in a table at the top of `volume.ts`: `hardSetCount`
  (working only), `countsForVolume` (working + drop + failure), tonnage (every non-warm-up
  `weight_reps` set). Strong-Pro splits them the same way in code; its docs/analytics.md line 14
  contradicts its own code and line 102.
- **Open decision, not changed:** should a receipt's / history's "Sets" include drop and failure
  sets? Today it shows `hardSetCount` (working only). Recommendation: keep `hardSetCount` for the
  verdict and eras, and add a separate all-completed-non-warm-up count for display. Waiting on the
  owner.
- Known limit, unchanged: a weighted bodyweight movement logged as `reps_only` counts no load
  (Strong-Pro's rule: no fake bodyweight tonnage). Log added load on a `weight_reps` exercise.

### 2026-09-29 — Plan PR 4b: `time`

- `src/domain/time.ts` is now Strong-Pro's module plus Lockd's helpers: date ranges
  (`resolveRange`, `previousRange`, `isWithin`, `RANGE_*`), `parseIso`, `nowIso`, `formatDate`,
  `formatDateTime`, `relativeDay`, and Strong-Pro's `elapsedSeconds` (it clamps a negative pause
  so it can't add time). Kept from Lockd: `nowParts`, `addDays`, the calendar ordinals,
  `formatLocalDate`, `formatWeekday`. Strong-Pro's 11 date-range tests are ported; 19 new tests
  cover the stored sign, ordinals and DST, `addDays`, `elapsedSeconds` and `relativeDay`.
- **Timezone sign, on purpose:** `Workout.tzOffsetMinutes` keeps Lockd's raw
  `getTimezoneOffset()` (positive WEST: UTC+1 = -60). Strong-Pro's function of that name returns
  the opposite sign, so it was **not** ported. `utcOffsetMinutes()` (positive east) exists for
  display and is documented as never to be stored. **The Strong-Pro importer (PR 7) must negate
  its `tzOffsetMinutes`.** The sign is now documented on the field in `types.ts`.
- Found by the tests: in UTC, `-getTimezoneOffset()` is `-0`, which prints as "-0". Fixed with
  `0 - offset`.
- No behaviour change in the app: every characterisation snapshot is unchanged. The new
  exports are unused until the analytics PR (8); nothing else was rewired.

### 2026-09-29 — Plan PR 4a: domain tests and the unrounded e1RM core

- Strong-Pro's tests for `units`, `oneRepMax`, `plateCalculator` and `warmup` are ported (69
  tests), with its doc comments. Phase 1 said these five modules were logically identical to
  Strong-Pro's; the AST diff against the previous Lockd files confirms it (only ternary line
  wrapping differs, and Lockd's `parseWeightInput` and its `×`/`−` labels are kept).
- **A-5:** `oneRepMax.ts` gains `e1rmExact(weight, reps, formula)`, the unrounded core (one rep
  is the load itself; null with no load or past 12 reps). `estimateOneRepMax` now rounds its
  result, with the same output as before: every characterisation snapshot is unchanged.
  `src/domain/e1rmExact.test.ts` holds Appendix A's hand-checked vectors and asserts that
  `estimateOneRepMax`, `bestOneRepMax` and analytics' `estimateFromSet` all equal the rounded
  core for every rep count 1–12, both formulas, seven loads. Lift Math (Phase 3) must call
  `e1rmExact` and round in the unit the lifter typed.
- This branch includes the timezone pin from #5 (merged in so CI is green on its own); once #5 is
  on `main` that part of the diff disappears.

Still to do in plan PR 4: `time` (ranges and tests; keep Lockd's stored tz sign), `volume`,
`records`, `exerciseTaxonomy`, the union of `types`, and the evidence catalog. `volume` and
`records` change engine output, so they land as separate PRs with reviewed snapshot diffs.

### 2026-09-29 — Fix: test suite pinned to UTC

- `verify` was red on `main`: `workflow-characterisation` snapshotted an absolute instant
  (`18:00Z`) for a "local noon" fixture, so it passed only in UTC−6 zones (checked: Denver and
  Mexico City pass; UTC, London, Chicago, Dubai and Auckland fail) and would fail on GitHub's UTC
  runners. Vitest now pins `TZ=UTC` in `src/test/global-setup.ts`, a guard test
  (`src/test/timezone.test.ts`) fails clearly if that config regresses, and the one affected
  snapshot line is updated (`18:00Z` → `12:00Z`). The full suite gives identical results in five
  machine timezones.
- Review of the privacy and characterisation work (Codex, 29 Sep) found it sound. Follow-ups, not
  fixed here: `saveProfile` doesn't clear `privacy_notice_pending`, so the "your locker is now
  private" notice stays after the owner deliberately publishes; `LockerPage` is exported from a
  route file, so TanStack warns it can't be code-split (move it to a component); the locker has
  no e2e or screenshots (Codex's sandbox couldn't launch a browser).
- The Hevy importer is **not built**: only two synthetic fixtures and the contract in
  `docs/consolidation/HEVY-IMPORT.md`. It is plan PR 7.
- Product repo: Codex worked in `motivatedc-creator/Lockd`; this session can't push there. Its
  `main` was fast-forwarded into `Happy-Harris/LockD` (no new code) so work continues here.

### 2026-09-29 — Plan PR 3: Engine characterisation

- Characterisation fixtures now pin the existing behaviour of Chronicle, Ghost,
  autopsy, progression/easier-week, Lift DNA, queue, intelligence, recovery,
  volume landmarks, strength standards, Lockd's weekly verdict, moments,
  wrapped, programs, CSV import/export and store actions. The demo already
  accepted a clock parameter on `main`; tests pass a fixed local-noon clock and
  use deterministic ids. No engine logic was changed.
- Known defects are intentionally preserved by assertions: renaming an era
  orphans sessions, first exposure is described as a PR, an incomplete exercise
  counts as behind, no recovery history reads as Fresh, missing landmark reads
  as MEV, and a European Strong CSV loses/misreads data. A later fix must change
  the corresponding test and explain its before/after behaviour.
- The only Hevy export fixtures committed are the two owner-supplied synthetic
  kg/km and lb/miles files under `src/test/fixtures/hevy`. Importer scope and
  the limited verification label are in `docs/consolidation/HEVY-IMPORT.md`.
  The Hevy importer is scheduled for plan PR 7, not added here.
- This PR began from `main` at `fa3ba3e` and merged updated `main` after
  the privacy PR landed. Browser tests/screenshots remain blocked here by the
  execution environment's network-interface/socket restrictions.

### 2026-09-29 — Privacy prerequisite before plan PR 3

- Owner approved private defaults and switching **all existing public lockers** to private.
  Migration `0003_locker_privacy.sql` changes the database default, marks previously
  public rows private, and adds a server-persisted notice flag. The migration ledger
  runs this once; a later explicit opt-in is preserved.
- Profile creation and the locker form default private; saving waits for the profile
  to load. The owner explicitly enables Public locker and saves to publish again.
  The migration notice remains until acknowledged. Published receipts are separate
  and stay public until the owner uses Unpublish; revoked links stop resolving.
- Shared development identity cannot access cloud owner operations. Guest logging
  remains local. Real auth-provider sign-in is still not configured or verified.
- Regression tests exercise old-format rows through the real SQL migration and API
  handlers in PGlite, plus the locker component's default, loading and opt-in states.
- Browser verification and 390/1024 screenshots remain outstanding: Chromium launch
  fails in this environment with `socket() failed: Operation not permitted`.
  `test:e2e` also fails before tests: Vite cannot enumerate network interfaces
  (`uv_interface_addresses`, EPERM).
  Do not treat component tests as browser or visual verification.
- Owner decisions (repo location, main-only PR targets, synthetic Hevy sample approval)
  recorded in PLAN-ADDENDUM §10. Next: characterisation on a separate branch from main.

### 2026-09-28 — PR 2: Critical fixes

- **I-4** (first commit): the unauthenticated `askTheLab` endpoint is gone. `consultLab` refuses
  the shared dev user (what `authMiddleware` returns when sign-in is off) and caps model calls at
  `LAB_DAILY_LIMIT` per user per 24 h (default 10). Guests keep the on-device read. Lab copy no
  longer names the provider; the brand check is now at 0 findings.
- **I-1**: the Train tab crash (a Zustand selector returning a new array) is fixed.
- **I-42 (new, found this PR)**: seven detail screens were unreachable. TanStack flat routes
  nested `history.$id`, `library.$id`, `programs.$id`, `routines.$id`, `tools.plates`,
  `tools.warmup` and `workout.$id.summary` under their list routes, none of which render an
  `<Outlet />`, so each URL showed the list page, and finishing a workout left a blank screen.
  Files renamed to the un-nested form (`history_.$id.tsx`, ...); URLs unchanged. **Correction to
  Phase 1:** the matrix described these screens (session replay, exercise detail with DNA and
  standards, plate calculator, warm-up generator, summary) from their code; users could not reach
  any of them.
- **I-3**: Discard asks first (Radix AlertDialog, "Keep logging" focused); a long-press set
  delete shows Undo (`restoreSet`).
- **I-2**: sign-in plans before touching the log (`src/lib/cloud/signin-merge.ts`): push, take
  the cloud copy, or merge by id; a safety copy is written first to IndexedDB `lockd` →
  `safetyBackups` (a failed copy aborts); Settings → Data lists copies with downloads. Revision
  compare-and-swap on push is not done yet.
- **I-7** landed in PR 1.

Newly visible now that the summary renders (not fixed; engine behaviour, characterise first):
the workout diff marks exercises with no completed sets as "behind" (`0r (−32 kg · −9 reps)`),
and the summary tells guests "The session is on the locker". Routine "Delete" has no confirm.

Not verified: sign-in against a real auth provider (none configured here); the sign-in logic is
covered by unit and real-store tests instead.

### 2026-09-28 — PR 1: Guardrails

- `npm ci` works again (lockfile regenerated). Vitest 5 + Testing Library + jsdom + Playwright
  added. Vitest 5 needs `overrides.better-auth.vitest` because better-auth declares an optional
  `vitest ≤ 4` peer while Vite 8's optional devtools peer pulls Vitest 5; test tooling only.
- `npm run verify` = lint + typecheck + Vitest + build. CI (`.github/workflows/ci.yml`) runs
  verify, the brand check (report only) and Playwright at 390 and 1024 px.
- Lint errors fixed (0 errors, 8 old warnings left). Includes I-7: `ProgramShare` on `/s/$id`
  called hooks after an early return.
- Legacy app-builder tests moved to `npm run test:legacy` (16 of 195 fail on files the re-upload
  didn't include); removed with the scaffolding in PR 12 (decision D11).
- Brand check `npm run check:brand`: 3 findings in `src/routes/lab.tsx` (the Lab's "Grok" copy,
  fixed in PR 2); 5 scaffolding strings allowlisted with reasons. Warn-only until PR 10.
- History-never-paywalled promise: README, Settings → Data, `src/lib/promise.ts`; guarded by an
  import-graph test and an ESLint rule.
- `GymGate` sets `html[data-gym-ready]` after hydration so e2e waits for an interactive page.
- Real `AGENTS.md`, `CLAUDE.md`, six subagents in `.claude/agents/`.

Next: PR 2 (critical fixes), starting with the unauthenticated `askTheLab` (I-4).
