# Handover log

State, most recent first. Read at the start of a session. Append an entry at the end of each PR:
what shipped, what it means for the next session, and anything not verified. This is a log, not a
doc to rewrite.

## Log

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
