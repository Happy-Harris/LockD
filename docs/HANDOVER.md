# Handover log

State, most recent first. Read at the start of a session. Append an entry at the end of each PR:
what shipped, what it means for the next session, and anything not verified. This is a log, not a
doc to rewrite.

Labels: entries are headed by **Step** (older ones say "Plan PR", the same thing); see
`docs/STATUS.md` § 1 for the scheme, and for what is done and what is next.

## Log

### 2026-09-29 — Step 9 closes: logging-speed e2e (principle 1)

- **`e2e/logging-speed.spec.ts` (4 tests, run at 390 and 1024 px, 8 in all):** a whole repeated workout is logged with exactly one
  tap per set and nothing else; one tap completes a set and the rest timer shows within a 1.5 s budget; previous values
  are inline and a typed weight wins over the prefill; the active workout and the rest timer survive a reload.
- **Measured locally:** tap to rest timer about 433 ms (phone) and 444 ms (desktop). That includes Playwright's own
  polling, so it is an upper bound. The budget has about 3x headroom for CI on the dev server.
- **Honest limits:** the time budget has never been seen to fail (no deliberate regression was tried), so it catches large
  regressions, not small ones. The tap-count assertion is exact. Nothing here measures logging with a screen reader,
  a slow phone, or a real gym network.
- The first run failed twice, both mistakes in the test (it assumed every set carries a load, and it read the wrong
  exercise's set), not in the app.
- **Step 9 is done with carried items:** true per-set targets, and baseline comparison of the workout page for 9c, 9d
  and 9f-1 (see STATUS, "Open items carried by Step 9").

### 2026-09-29 — Step 9f-3: show the routine's effort target (small version)

- **What:** when a routine sets an effort target, the exercise header shows it ("target RIR 2" or "target RPE 8", in the
  lifter's current mode) and the RPE/RIR pick sheet marks that value. RPE and RIR targets never cross: a routine with only an
  RPE target shows nothing in RIR mode. A routine with no target shows nothing (nothing is invented), and a target
  of 0 is shown. An exercise with no reps row (a plank) shows none, because effort is logged beside reps.
  Nothing is filled in for the lifter: the pick stays a tap.
- **Scope, honestly:** this is NOT the donor's per-set targets (a different target for each set); that module is not
  reachable here and would need a new stored structure and a migration. The existing routine fields `targetRpe` and
  `targetRir` are only displayed. No screen edits them, so today this shows for imported routines (Knurl and RepForge
  carry them) and not for workouts started from a program (those have no routine row).
- **Checked in the running app (390 px):** imported the Knurl fixture's routine, switched Effort to RIR, started it:
  the exercise with an RIR target shows "target RIR 2", the one with only an RPE target shows none. **Not checked
  visually:** the ring on the pick sheet (the button that opens it is not shown for the fixture's timed exercise).
- Tests: `intensity.test.ts` gained 2 (6 in all).
- **Step 9 is not done yet:** the timed logging-speed e2e the plan asks for is still owed (next PR).

### 2026-09-29 — Step 9f-2c: log a unilateral exercise as left and right rows

- **Per-exercise switch:** the exercise page has "Log each side separately" (`updateExercise({ unilateral })`), so existing
  installs need no seed migration. It applies to workouts started afterwards; the workout exercise snapshots it
  (`unilateralSnapshot`), so a mid-workout edit cannot change how it logs.
- **Rows:** starting from a routine or a program, Add exercise, and Add set now create a left and a right row per set,
  sharing a `pairId` (`pairs.ts`). A routine's `targetSets` counts sets (pairs), never rows. A warm-up stays one row.
  Bilateral exercises are untouched (the existing bilateral tests and snapshots pass unmodified).
- **Rest:** one tap completes one side; the rest timer starts after the second side (and, in a superset, after the last
  exercise). **Check:** in the running app, no timer after the left side and a 2:02 timer after the right.
- **Previous values and ghosts:** a sided row takes the same set number on the same side. If the last session had no
  sides, both sides take that session's set of the same number (never the right side against set 2).
- **Display:** rows show 1L, 1R, 2L, 2R. The header counts sets, not rows (0/3, 1/3 after the left side, still 1/3 after
  the right). Saving a routine from a workout saved 6 sets for 3 pairs before this was fixed; a test now pins it.
- **Bug found by the running app:** none in the product. A redirect from `/workout` seen while testing came from a
  test hook that created a second copy of the store, not the app (see the run-lockd skill gotcha).
- Tests: `pairs.test.ts` (14). Screenshots at 390 and 1024 px were looked at; not compared with `baseline/`.
- **Not done:** deleting one side leaves an orphan side (counts as one set); swapping to a unilateral exercise keeps
  the old rows; RPE/RIR is per row; the receipt still does not say "pairs counted as one set"; the left/right
  difference view (VISION #32) is untouched.

### 2026-09-29 — Step 9f-2b: a left/right pair counts as one set

- **Rule (a default the owner can reverse; the donor's rule was not reachable):** rows with a `side` and a shared
  `pairId` count as ONE set, so a one-arm row is not double the sets of a barbell row. `setCountKey` (in `volume.ts`)
  is the single definition; a `pairId` without a `side` is ignored, and a pair with only one side done counts once.
- **Changed:** `hardSetCount`, `completedSetCount`, set counts in `totalsForGroups`, `attributeVolumeByMuscle` and
  `attributeMuscleVolume`, the weekly verdict's hard sets, and the muscle-set insight (the pair's first row carries
  the credit and the evidence row; the second side has no evidence row of its own).
- **Not changed:** tonnage still adds both sides, and e1RM and PRs are read per row (per limb), never summed.
- **Test diff:** only `unilateral-counting.test.ts` (renamed from the 9f-2a file) changed values: 6 to 3 sets, 8 to 5
  hard sets. The other 830 tests, including every engine snapshot, pass unmodified, so nothing shown for a
  bilateral log moved.
- **Not done:** the receipt copy "pairs counted as one set" (the receipts don't yet distinguish pairs); screens
  that count rows for display were checked by grep (only the workout header did; fixed in 9f-2c); nothing creates left/right rows when logging yet (9f-2c).

### 2026-09-29 — Step 9f-2a: pin how left/right rows are counted today (characterisation only)

- **No behaviour change.** `unilateral-characterisation.test.ts` (5) pins what the engines do with `side` rows, which
  importers can already write: a row is a set (a left and a right row are two sets, two hard sets), tonnage adds across
  sides, the muscle is credited one set per row, and the e1RM record is the best single row, never a sum of limbs.
  It also pins that pair rows are indistinguishable from bilateral sets in every total.
- **Why this comes first:** CLAUDE.md asks for fixtures before an engine's logic changes, so the counting change in 9f-2b
  shows up as a reviewable diff of this file.
- **Decision needed before 9f-2b:** should a left+right pair count as one hard set (the usual convention, so a
  one-arm row is not counted as double the volume of a barbell row) or two (each limb did a set)? The donor's
  `setGrouping.ts` would have answered this, but that repo is not reachable here (`list_repos` shows only
  `LockD`, `Lock-D` and one unrelated repo). Recommendation: one hard set per pair, tonnage still summed across
  sides, e1RM and PRs per limb, and the receipt says "pairs counted as one set".
- **Rest of 9f-2:** 9f-2b counting rule; 9f-2c logging (create L/R rows sharing `pairId`, snapshot `unilateralSnapshot`,
  rest only after the second side, ghost and previous values keyed by set number and side, a per-exercise Unilateral
  toggle so existing installs need no seed migration).

### 2026-09-29 — Step 9f-1: supersets

- **Link two exercises:** each exercise header has a link button that supersets it with the next exercise (press again to
  unlink). Members show a badge, A1/A2, B1/B2, in workout order. A superset always has two or more members: unlinking
  never leaves one. Starting from a routine now carries the routine's `supersetGroup` onto the workout (it was
  imported and exported already but dropped here); repeating a workout already kept it.
- **Rest:** completing a set on a superset member other than the last starts no timer; the last member's set starts the
  exercise's own rest. Everything else about one-tap completion is unchanged.
- Tests: `superset.test.ts` (6: labels, where rest lands, link/unlink/split, the store starting no timer between partners).
- **Not done:** reordering exercises to sit together, editing supersets in the routine editor, alternating focus to the
  partner after a set. **Not covered:** no component or e2e test and no screenshots of the workout page with a superset.

### 2026-09-29 — Step 9e: equipment editor for bars, collars and plates (I-35)

- **Settings > Equipment** (`equipment-editor.tsx`): pick the default bar, edit its name, weight and collar weight (in
  your unit), add a bar; pick the default plate inventory and set how many plates of each weight you own (steps of
  two, since counts are physical plates and only pairs load), add a weight, set a count to 0 to remove it.
- **It drives the maths:** plate-aware rounding (`barbellSnap`) and the plate calculator read the same bars and plates
  the editor writes, so suggested loads are ones your gym can make. `equipment.test.ts` (5) pins that a typed bar
  weight moves the snap and a removed plate stops being offered.
- **Storage:** no change. `bars`, `plates` and both default ids were already persisted and in the backup schema,
  so no migration. New store actions: `updateBar`, `addBar`, `setPlateCount`.
- **Not done:** deleting a bar or an inventory, editing per-exercise bars, a new-inventory flow. **Not covered:** no
  component or e2e test of the editor, no 390/1024 px screenshots.

### 2026-09-29 — Step 9d: the workout page stops redoing history work (I-26)

- **Clock isolated:** the once-a-second tick now lives in `ElapsedClock`, so the page and its set rows no longer
  re-render every second.
- **Progression memoised:** the per-exercise progression suggestion is computed in one `useMemo` that depends on the
  finished sessions, not on the sets being edited, instead of for every block on every render.
- **Slices:** `sliceSessions` groups exercises and sets by workout in one pass (was a filter per workout), same
  output and order (`slices.test.ts`). `stabiliseSlices` (used by `useSlices`) reuses the previous slice for every
  session whose objects are unchanged, so editing the active workout leaves the finished sessions, and anything
  memoised on them, alone.
- Numbers are unchanged: the 817 existing tests, including the engine snapshots, pass unmodified.
- **Not measured:** no timing was taken on a large history; the change removes the repeated work by construction.
  The "learned rest over full history" part of I-26 was already moved out of render in 9b.

### 2026-09-29 — Step 9c: pick RPE or RIR directly (I-31)

- **I-31:** the effort button on a set opens a pick sheet (RPE 6 to 10 in halves, or RIR 0 to 5) instead of
  cycling up to nine taps. Tapping the chosen value again clears it; a set with no value shows "—", never 0 (RIR 0 is a
  real value). New setting Settings > Effort: RPE, RIR or Off (`intensityMode`, already in the backup schema, so no
  migration). Logic is in `src/lib/gym/intensity.ts` with `intensity.test.ts` (4).
- **Never converted (D4):** RPE and RIR are stored in their own fields; switching mode hides the other, deletes nothing.
- **Not done:** the routine's `targetRir` is not shown yet, and a new set does not copy the previous session's RIR
  (RPE still does). Both belong with 9f per-set targets.
- **Not covered:** the sheet itself has no component or e2e test; not checked at 390/1024 px screenshots.

### 2026-09-29 — Step 9b: your rest wins, separate warm-up rest, vibrate and notify (I-21)

- **Precedence (I-21):** after a set the timer runs the exercise's rest: the routine's rest if it has one, else the
  default the lifter set (both are snapshotted onto the workout exercise). The built-in 180/150/120/75 s guesses
  (`restPersonalitySeconds`) are deleted; nothing used them once this landed. The rest the lifter actually takes
  (`learnedRestSeconds`, needs 4 gaps) is offered as a "You usually rest 2:30" button on the timer bar when it
  differs by 15 s or more. It is never applied on its own (D7). The manual "Start rest" button on the workout
  page uses the same rest.
- **Warm-up rest:** new optional setting `warmupRestSeconds` (missing or 0 = no timer, which is what warm-ups did
  before). Settings > Rest timer has it. The backup schema accepts it as optional; the old-format backup fixture
  still loads and the field round-trips (`backup-fields.test.ts`).
- **Vibrate and notify:** the two settings already in the backup schema now do something. When rest ends the timer
  bar vibrates and, if the tab is in the background and permission was granted, posts a notification. Turning
  Notify on asks for permission and stays off if it is refused. **Limit:** this is best effort. A locked phone or
  a throttled tab can delay it, and iPhone Safari does not vibrate. A reliable lock-screen timer needs native code
  (Phase 4 design doc).
- Tests: `rest.test.ts` (5: precedence, warm-up rule, suggestion threshold, the store starting the right timer).
- **Not verified on a real phone:** vibrate and the notification.

### 2026-09-29 — Step 9a: four logging input fixes (I-27, I-28, I-29, I-30)

- **I-27:** weight inputs show an ungrouped number (`formatWeightInput`), so 1000 kg is no longer shown as "1,000" and
  read back as 1. Display elsewhere still uses the grouped formatter.
- **I-28:** clearing the reps box clears the value (`parseRepsInput`) instead of storing 0.
- **I-29:** the +/- steppers use the exercise's own `incrementG` (dumbbells, machines) before the global quick
  increment. The workout page's suggestion also now passes the plate-aware `snap`, so it agrees with what
  starting from a routine prefilled (it did not before 8d-2).
- **I-30:** starting from a routine no longer puts the working weight into the warm-up row; `ensureWarmups` still
  builds the ramp.
- Tests: `logging-inputs.test.ts` (6). **Not covered by a test:** the stepper increment wiring (a UI change with no
  component test), checked by reading only.
- Step 9 is split into 9a to 9f; the list is in the STATUS.md row.

### 2026-09-29 — Step 8d-3: Ask the Lab answers on the device, with citations (I-4, D3)

- Ported the donor's deterministic Ask the Lab into `src/domain/analytics/askLab*.ts` (engine, data intents,
  shared types, 15 tests). Five questions about the lifter's own log (training enough, muscle contribution, why
  the weekly verdict changed, getting stronger, what to change) are answered from the same functions that drive
  the Data Lab cards; anything else is matched to a claim in the evidence catalog; a question it cannot compute is
  labelled "Not computed" and never gets an invented number.
- New `src/components/app/ask-lab.tsx`, mounted on `/lab` above the read. It works signed out and offline, and
  each answer lists the claims it cites, which open the existing receipt sheet. The signed-in written second
  opinion (`consultLab`) is unchanged and still gated and capped.
- Adapted to Lock'd: the donor test expected the 10–20 band to be a "research default"; the catalog here already
  calls it an implementation heuristic, so the test follows the catalog. The one Strong mention in the copy now
  says "a backup from another app".
- e2e (`critical-fixes.spec.ts`, I-4): a guest asks two starter questions, gets a "Computed" answer with cited
  claims, and still makes no POST request.
- **Not verified:** the wording of answers for lifters with under a month of history beyond the donor's fixtures.
  Free-text matching is keyword-based, so an unusual phrasing lands on "Not computed" rather than a wrong answer.

### 2026-09-29 — Step 8d-2: one stall rule, loads you can build (I-20)

- **Stall:** the progression engine no longer measures a stall against the lift's all-time peak (which
  made every comeback look stalled). It uses `computeStallComparison`: best e1RM over at least three
  sessions in the last 28 days against the same number before them. A gap over 28 days between the
  two windows (`STALL_MAX_GAP_DAYS`) is a layoff, not a stall. Consequence: a lifter with fewer than
  two windows of sessions gets no stall call. Autopsy and easier-week wording now say what was compared.
- **Loads:** `stepUpG`/`stepDownG` (domain) move a load by one increment or a percentage and always
  land on the increment grid. For barbell lifts with a bar and plates set up, `barbellSnap`
  (`src/lib/gym/loads.ts`) rounds to a total those plates can make. `ProgressionCall.lastWeightG` is the
  heaviest working load of the last session.
- **Program `linear` rule fixed:** it used to run only when there was no suggestion, which is never
  once there is history, so it never ran. Now it adds one increment to the last working load when the
  last session went to plan; after a miss the engine's lighter suggestion stands. Deload steps down
  from the suggestion. Snapshots: program deload 101150 → 87500 g, normal 105000 → 102500 g.
- **Tests:** `progression.test.ts` (stall window, layoff, grid, plate snap, program rule);
  characterisation snapshots re-recorded (only `lastWeightG` additions, the program numbers, and the
  autopsy losing its `flat_e1rm` finding for lack of an earlier window).
- **Not verified:** real-world plate inventories beyond the unit fixtures.

### 2026-09-29 — Docs: run-lockd skill

- Added `.claude/skills/run-lockd/` (`SKILL.md` + `driver.mjs`): how to start the app headlessly and
  screenshot routes at phone and desktop width. Every command in it was run in a fresh container.
- Seen while screenshotting, not changed: Today's "Within reach" card still shows unrounded estimates
  (132.71 → 136.5; the I-13 rounding covers the goal-lift card only), and the app icon/wordmark still
  shows an "R" tile.

### 2026-09-29 — Docs: STATUS.md, one label scheme for handing the project on

- Added `docs/STATUS.md`: what "Step 7b", "Opp 4", "LockD#23", "I-20", "D5" and "O2" each mean, every
  Step and every one of the owner's 11 opportunities with its state and the pull requests that did
  it, the open questions, and the terms. `CLAUDE.md` points to it, and it must be updated in the
  same PR as any status change.
- The naming had drifted: early PR titles said "PR 4a:", later ones "Plan PR 7b:", and two number
  systems overlapped (the plan's steps and the owner's opportunities). Past titles and entries are
  left as written (rewriting history helps nobody); from now on: `Step n[x]: …`, `Opp n: …`,
  branch `claude/step<n><x>-<slug>` or `claude/opp<n>-<slug>`.
- Nothing in the app changed.

### 2026-09-29 — Plan PR 8d-1: goal lifts are the lifter's own (I-19), with pickers; est. 1RM labelled and rounded (I-13)

Plan 8d is split. **8d-1 (this).** **8d-2:** the progression merge (I-20) and the deterministic Ask the
Lab (I-4, D3).

- **I-19 fixed:** the lifts tracked by the progression board, DNA, autopsies, milestone queue and the
  Lab brief were the **lens's own list** whenever a lens had one (Powerbuilding, Strength, Calisthenics,
  Hybrid), silently replacing the lifts the lifter had picked. Now they are the lifter's goal lifts,
  or their three most-trained if they picked none. The lens only chooses which blocks show and how the
  verdict is worded; the Skills block still uses a lens's own skill list because that is what it
  is. Effect: under Strength the board tracks three lifts (the lifter's) instead of four. A hook test
  runs every lens and checks the board's lifts are the lifter's, and fails if the swap returns.
- **Goal-lift picker** (`GoalLiftPicker`, a sheet): search the library, pick up to three, or "Use my
  top lifts instead" (none picked, and the verdict says it is a guess). Reached from the verdict
  card's "Choose"/"Edit" (Today and Data Lab) and from Settings, which shows the current lifts by
  name and replaces the old six-chip pool. **Lens sheet** (`GoalLensSheet`): "Change" on the verdict
  card, same six presets as the Today chips and Settings, said plainly: it never changes a number
  and never changes which lifts are tracked.
- **I-13:** the goal-lift card on Today labelled an estimated 1RM as a bare weight at two decimals
  (132.71 kg). It now says **Est. 1RM**, rounds to half a kilogram or a whole pound
  (`roundEstimateG`), and shows the set it came from and the date ("from 110 kg × 5, Mar 3").
  `e1rmSeries` points now carry that set.
- **Default goal lifts:** a new log still starts with bench, squat and deadlift as goal lifts (the
  onboarding default), so the verdict calls them "chosen". Unchanged here; changing the default is a
  product call.
- **Tests:** picker and lens sheet (RTL), the every-lens hook test (mutation-checked), `roundEstimateG`,
  e2e for picking lifts and for the Est. 1RM card.

### 2026-09-29 — Plan PR 8c-2: "last trained" replaces recovery states; standards bands replaced by a ratio

- **Recovery (plan I-9):** Today's recovery block is now **Last trained** and states a fact:
  "Today", "Yesterday", "3 days ago", or **"No sets logged"**. The old block gave every muscle a state
  (Loaded, Recovering, Ready, **Fresh**) from hours computed at day granularity, and a muscle with
  no data read as *Fresh*, which is rest the log cannot know. The four colour classes are gone
  (`.fresh-*`), and so are the words. `muscleRecovery`/`classifyHours` are replaced by
  `muscleLastTrained`; counts are whole calendar days, credit secondary muscles as before, ignore
  warm-ups and unfinished sets, and never go negative for a session dated after today. The
  characterisation snapshot diff is exactly the states becoming a day count (same dates); the "no
  data reads as fresh" BUG is fixed.
- **Standards (plan D4, I-11):** the strength "standard" bands (novice to elite, "male-ish" absolute
  numbers scaled linearly by body weight, no source) are deleted with `standards.ts`. A lift's page
  shows **Est. 1RM ÷ body weight** as a plain number (`1.42×`) with the two records it came from and
  their dates; the body weight is the latest on or before the lift, so a later weight never rewrites
  an old lift, and with none recorded it says so and links to Body. There is no scale to place it on
  and the text says that. The More screen's hint no longer promises "standards".
- **Not changed:** the Today "relative" block (calisthenics lens) still uses `intelligence.relative`.
  Ratio wording there and the goal-lift "Est. 1RM" labelling (I-13) are with 8d.
- **Tests:** `recovery.test.ts` and `relativeStrength.test.ts` (both new), the updated
  characterisation, and `e2e/honest-numbers.spec.ts`.

### 2026-09-29 — Plan PR 8c-1: muscle sets and personal targets replace the MEV/MAV/MRV bands

Plan PR 8c is split. **8c-1 (this):** muscle sets, personal targets, the verdict's balance line, and
removing the landmark bands (plan D5, I-10). **8c-2:** recovery copy (I-9) and strength standards
(D4, I-11).

- **Removed:** `src/lib/gym/landmarks.ts` (MEV/MAV/MRV per muscle, unsourced), its characterisation
  test, and the `volume-landmarks-defaults` evidence claim. The old code also said "MEV" for a muscle
  with no band at all (forearms); that defect went with it.
- **Muscle sets card (Data Lab):** this training week's credited sets per muscle against a target.
  Completed working sets only; a secondary muscle gets the fractional credit from settings (0.5).
  The target is the default 10–20 band, or a **personal target** the lifter saves per muscle (0 to
  100 sets, validated; a nonsensical range cannot be saved). "Show me why" lists every set that
  counted, under each muscle it credits. A muscle with no mapped exercise reads **Unmapped** with a
  link to Library (where Bulk Classify lives), never "low"; full-body and cardio show a total with no
  range. Personal targets were already in settings and in backups; now a screen edits them.
- **Today's volume block** (lenses that show it) now reads the same numbers: sets, "of 10–20", and
  the state, instead of an MEV/MAV/MRV word. Note the numbers differ from before: it now counts
  working sets only with fractional secondary credit, where the old block counted differently
  (I-22, one meaning of "hard set").
- **Verdict balance line:** the weekly verdict gets one sentence on last week's muscle balance
  ("Balance: Chest below."), from the same insight rows, with an evidence sheet and a way into the
  claim behind the default band.
- **Evidence:** `weekly-credited-sets-10-20` (a product default, labelled as such, sources: Schoenfeld
  2017 and Pelland 2026, limits stated: the literature supports a lower region near 10 sets, not an
  upper limit of 20) and `personal-muscle-targets` (a user's own range, no citation). The donor's
  wording that leaned on a position stand's "≥10 sets" was not carried over because I did not
  re-verify it against the source.
- **Tests:** the donor's card tests as React Testing Library tests, plus one for refusing a bad
  range and the balance region; e2e for saving a personal target and the Today block.
- **Not done:** the goal-lift and lens pickers (8d); `secondaryMuscleCredit` still has no screen.

### 2026-09-29 — Plan PR 8b: the weekly verdict and change flags on screen

- **Replaced:** Lock'd's old verdict (`buildWeeklyVerdict`, a ±10% call on hard sets) is gone.
  Today (when the lens shows a verdict: Strength, Hypertrophy, Hybrid, General) and Data Lab now show
  the ported **weekly verdict** card, and Data Lab also shows the **change flags** card (deload, spike
  and stall, each with a receipt). `src/lib/gym/entries.ts` (`loggedEntriesOf`) hands the finished log
  to the engines; `useGymDerived` returns `verdict`, `verdictLens` and `flags`.
- **What the lifter sees:** last week against the mean of the three to four training weeks before it,
  in sentences whose numbers are buttons. Each opens a sheet with the logged weeks and the arithmetic.
  A week can now be called deload-shaped (or, under Strength, an intensity block), a big jump is
  named, and a sentence says which goal lifts it drew on with a link to Settings to change them.
  "Not enough history" and "welcome back" say so in words.
- **The stamp on Today is now honest:** it reads UP, HOLD or DOWN only when the log backs a direction,
  LIGHT for a deload-shaped week, and is not drawn at all with too little history. Before, the old
  code stamped HOLD on a log with no baseline.
- **Numbers that changed** (reviewed in the `secondary-characterisation` snapshot, which now pins the
  verdict's figures and words rather than its inputs): direction is by the new bands (big jump
  above +50%, up from +10%, down from −10%, well down at −30% or worse); the baseline is up to four
  weeks with something logged, found within eight. On the dated demo: last week 54 hard sets, three
  sessions, steady, tonnage 31,351,750 gram-reps: the same figures as before, with a standout
  ("Bench Press hit a new best estimate of 131.3 kg") the old verdict never produced.
- **Removed from screens:** the old Data Lab header stat "Hit rate" and the Today verdict's stat row
  (the hit rate is still on the Lab screen and each lift's page). Nothing stored changed.
- **Evidence catalog:** `weekly-verdict-direction` rewritten to match the new rule; added
  `weekly-verdict-deload-shape`, `weekly-verdict-spike-flag`, `training-stall-flag`, each checked
  against the engine's constants (60% and the session floor, 50%, 28 days and three sessions). All
  are `implementation_heuristic` with no source, said so in the sheet ("a product rule").
- **New UI pieces:** `Sheet` (a Radix dialog that rises from the bottom on a phone), the claim sheet,
  the verdict evidence sheet, the flags card. The donor's card tests came across as React Testing
  Library tests (`weekly-verdict-card.test.tsx`, `change-flags-card.test.tsx`), plus `entries.test.ts`.
  `e2e/verdict.spec.ts` covers Today (Strength lens), the sheet, and Data Lab.
- **Left for later slices:** the muscle-balance sentence (needs muscle sets, 8c; the copy already has
  a slot and receives `null`), pickers for goal lifts and lens (8d; Settings edits them meanwhile), a
  fix for the default goal lifts being three seeded lifts that read as "chosen".
- **Not verified:** the wording of every state on a phone by eye; only the states in the donor's
  golden fixtures and the sample log are exercised.

### 2026-09-29 — Plan PR 8a: the analytics engines (ported, tested, not wired yet)

Plan PR 8 is split, as the plan allows. The owner confirmed "replace as planned" (Lock'd's verdict,
landmark bands and standards bands are replaced by the ported versions, plan D4 to D6).
**8a (this):** the pure engines and their tests, with nothing on screen changed. **8b:** the weekly
verdict and training flags on screen (replacing Lock'd's verdict, with evidence sheets). **8c:**
muscle sets and personal targets (replacing MEV/MAV/MRV), the recovery copy (I-9) and standards
(D4, I-11). **8d:** goal lifts and one lens module (I-19), the progression merge (I-20), and the
deterministic Ask the Lab.

- **`src/domain/analytics/`:** `compute` (the logged-entry shape and analytics options),
  `trainingWeeks`, `weeklyVerdict` (+ `metrics`, `util`, `presentation`), `trainingFlags` (deload and
  spike flags), `muscleSets`. Copied from the donor with only import paths, quotes and formatting
  changed; the donor's 134 unit tests and its golden fixtures came with them and pass unchanged.
- **`src/domain/progression.ts`:** the donor's windowed stall rule, next-load and receipt logic,
  with its tests. Lock'd's own `src/lib/gym/progression.ts` is untouched; the merge (I-20) is 8d.
- **Lens:** the engines' wording input is `VerdictLens` (`build | strength | maintain`, copy only,
  never a figure). Lock'd's six presets map onto it in `verdictFraming` (`lenses.ts`): strength →
  strength, hybrid → maintain, the other four → build. **This mapping is a product call made here**;
  change it in one place if it is wrong.
- **Evidence:** only the `RESEARCH_WEEKLY_SET_BAND` constant (10–20) is added. The donor's claims
  for the verdict, flags and personal targets are **not** restored yet: they come with the screens
  that show them (8b, 8c), so the catalog never describes behaviour the app does not have. One donor
  source (Refalo 2023) is also left out until a claim uses it and its DOI is checked.
- **Tests:** the donor's (134) plus `lenses.test.ts`. The paywall guard now also walks the new
  modules.
- **Not verified:** nothing here is reachable from a screen, so no user-visible behaviour changed.

### 2026-09-29 — Plan PR 7f: CSV export rewrite and the seed library top-up (closes plan PR 7)

- **CSV export (`src/lib/export/csv.ts`, replaces `src/lib/gym/csv.ts`):** Settings now has five
  files: **sets** (one row per completed set of a finished session), sessions, exercises, routines
  and measurements. Weights are written exactly (three decimals in kg, four in lb; a property test
  over every gram from 0 to 400,000 shows they read back as the same grams) and a set with no weight
  has an empty cell, never 0. The unit is in the header (`Weight (kg)`). A session's date is the
  wall-clock time it was logged at, in its own offset. Every cell goes through `escapeCsvValue`, so
  a note of `=cmd|...` exports as text. The download carries a byte-order mark for Excel; the
  importer ignores it.
- **It comes back:** the sets file is read by the import wizard and by the Strong importer (the
  Strong profile now also knows `Exercise Notes` and `Superset`). A test exports the 137-session
  sample log in both unit systems and re-reads it: every session's fingerprint is already in the log
  (`e2e` does the same through Settings: "Imported 0 sessions … already here"). One limit: an
  exercise that appears twice in one session, in two separate blocks, is read back as one block
  (the importer groups by name) and would not be recognised.
- **Characterisation:** the old export (date only, unit unknown, no RIR) is replaced; the snapshot
  diff is exactly the new columns. `exportSetsCsvText` is gone from the store.
- **Seed library 66 → 93 (plan I-36):** the 27 exercises the other app had that this one did not
  (Strong-Pro's list was 92; this library also keeps its own "Farmer's Carry"), same classification
  vocabulary, ids `seed-<slug>`, two assisted lifts track the assistance (`assisted_weight`), one
  one-sided (`Single-Arm Dumbbell Shoulder Press`).
- **Versioned top-up:** `SEED_LIBRARY_VERSION` (was never read) is now 3, and `SEED_ADDITIONS` says
  which version added what. At boot an existing log is caught up once (`topUpSeedLibrary`): only
  exercises added in versions it has not applied, never one whose id or name already exists (a custom
  "Box Squat" is not doubled), never a change to a row that exists (archived or renamed seeds stay as
  they are), and an exercise removed after the top-up is not brought back. The applied version is
  the `meta` key `seedLibraryVersion` (additive; a log without it is treated as version 2, and the
  old `lockd-v1` payload is untouched). It is recorded only after the rows are written, so a failed
  write is retried at the next boot and never blocks opening the app.
- **Also:** the name-based suggester now answers `Nordic Curl` (hamstrings, hinge) and `Neck Curl`
  (neck) rather than biceps; its contract test now measures the 93-exercise library (68 answered,
  66 agree, the same two arguable calls).
- **Tests:** `export/csv.test.ts` (15, mutation-checked: pounds and kilogram precision, completed
  filter, status filter, blank-as-zero, wall clock, unit header), `gym/seed.test.ts` (11),
  four boot tests with the old-format fixture (a 66-exercise log with no version), and
  `e2e/library.spec.ts`. The boot test that injects a failed write now arms the failure after boot,
  because the top-up also writes.
- **Plan PR 7 is complete.** Next: PR 8 analytics (records, e1RM, volume: engines were characterised
  in PR 3).

### 2026-09-29 — Plan PR 7e: the import wizard and Bulk Classify

- **`/import` (More → Import; also linked from Settings):** pick a source (Strong CSV, Hevy CSV,
  another CSV, a backup from another app), then **Columns** (CSV only: each field's column with
  sample values, required fields flagged, weight and distance unit choices that beat the header),
  **Sessions** (tick or untick each; sessions already in the log are marked and start unticked;
  "add a second copy" is an explicit opt-in; issues listed), **Exercises / Resolve** (exact-name
  matches are merged without asking; a near match is a question, "Same exercise" or "Different, add
  as new", default new), **Ready to import** (counts; nothing has been written yet), **Done**
  (summary, then Bulk Classify). Works offline (the route uses the shell like every screen).
- **Nothing is written before the last button.** `importPrepared` applies the analysed file with the
  choices (`selectedKeys`, `allowDuplicates`, `nameOverrides`); the one-step Settings imports are
  unchanged.
- **Bulk Classify (`BulkClassify`, on the Done step and in Library when any exercise is unmapped):**
  lists exercises with no muscle group; a name-based suggestion (`suggestExerciseTaxonomy`) is shown
  and used only when tapped ("Fill in all N suggestions to review" also only fills the form);
  nothing is saved until **Apply**. `classifyExercises` changes only exercises that are still
  `unmapped`, and fills a past session's snapshot only where it is still `unmapped` (equipment only
  where it is still `other`), because muscle analytics reads the session's snapshot. It never
  overwrites a classification, and "unmapped" is not accepted as one.
- **Engine:** `chosenUnit` and `chosenDistanceUnit` (a person's choice beats the header, which beats
  the setting), `detectedDistanceUnit`, and a `generic-csv` profile (Strong's column spellings; the
  Columns step fixes the rest). "Not in this file" on a column is an explicit `undefined` that beats
  the automatic guess.
- **Also:** `Card` now forwards `data-testid` (it silently dropped it before; TypeScript allows any
  `data-*` attribute, so nothing warned). `describeImport` moved to `src/lib/import/summary.ts`.
- **Tests:** `classify.test.ts`, `wizard.test.ts`, `wizard-store.test.ts` (mutation-checked: no
  overwrite of a classified exercise or of a session's own muscle, "unmapped" as a classification,
  both unit choices), and `e2e/import-wizard.spec.ts` (map unfamiliar columns and confirm a merge,
  nothing written before Import, classify only what is accepted; backup with an unticked session and
  the "already here" marking; a bad file is refused).
- **Not done / next:** 7f the CSV exporter rewrite and the seed library top-up to 92 exercises.
  Not tested on a real device; the wizard is a plain form flow with no new dependencies.

### 2026-09-29 — Plan PR 7d-2: import a vault from the other sister app (knurl-os v1), and unsided girths

- **`src/lib/import/knurl.ts`:** reads a vault export (`brand: "knurl-os"`, schema version 1) through
  the same pipeline as 7d-1. Shared helpers moved to `foreign.ts` (JSON parsing, refusal text with
  paths, wall-clock stamp, `whole`, `oneOf`). The Settings input "Import a backup from another app
  (JSON)" now recognises either format; a file that is neither is refused.
- **Units:** kilograms and metres arrive as decimals and become whole grams and metres
  (100.5 kg → 100,500 g). Measurements: kilograms → grams, centimetres → millimetres.
- **Time zone:** that app already uses raw `getTimezoneOffset()`, so the offset is carried as it is
  (no negation, unlike 7d-1). The local date comes from the wall clock at that offset.
- **Vocabulary, stated not smoothed:** same names and plain renamings map directly (`quadriceps` →
  quads, `abdominals` → core, `distance_time` → distance and duration). Groups this app holds inside
  a wider one map to it (three delts → shoulders, upper back and spinal erectors → back, obliques →
  core) and the summary lists which. `specialty_bar` → barbell (said). **`push`/`pull` are not
  guessed as horizontal or vertical**: those exercises keep the placeholder pattern every
  unclassified exercise has, and the summary tells the lifter to classify them (Bulk Classify, 7e).
  A muscle value the app does not know leaves the exercise unmapped.
- **Unsided girths (plan D13, approved):** `MeasurementMetric` gains `arms`, `thighs` and `calves`,
  labelled "… (side not recorded)". A girth recorded without a side is never split into left and
  right. Additive: `lockd-backup` files without them read as before, and the backup schema lists them.
  The Body screen offers them because it lists every metric.
- **Summary fix (also affects 7d-1):** "New exercises to classify" now lists only exercises with no
  muscle group, not exercises a backup classified; the import note pluralises correctly.
- **Tests:** 20 in `knurl.test.ts` (synthetic fixture `src/test/fixtures/knurl/`, mutation-checked:
  sign, both unit conversions, push guessed, arms split, merged-muscle report, backup enum, display
  unit) and an e2e case. The e2e for 7d-1 now finds its sessions by start time; the two sessions in
  that fixture share a name and the log's order is not chronological.
- **Not verified:** a real vault export from the other app.

### 2026-09-29 — Plan PR 7d-1: import a backup from the sister app (`repforge-backup` v1)

Plan PR 7d is split. **7d-1 (this):** the `repforge-backup` reader and the engine changes it needs.
**7d-2:** the knurl-os vault reader, and the unsided girth metrics (D13).

- **`src/lib/import/repforge.ts`:** validates the file (Zod, bounded, unknown keys dropped, a newer
  format refused with that reason, bad values refused with where they are) and turns it into the same
  parsed structures a CSV makes, so it uses the same pipeline: duplicate check by fingerprint,
  exact-name exercise match, "nothing invented". Carries finished sessions with sets, RPE, RIR,
  supersets, sides/pairs, notes, paused time and the session's own length; routines with their
  targets; body measurements (already grams and millimetres, same as here).
- **Time zone:** the other app stored the offset with the opposite sign (positive east). It is
  negated on the way in, so `Workout.tzOffsetMinutes` keeps this log's raw `getTimezoneOffset()`
  sign. Tests pin +60 there → -60 here, and that a session is still recognised after the device
  zone changes.
- **Classification, not guessing:** an exercise the file classifies keeps its muscle groups,
  equipment, pattern and tracking. A muscle value this app does not use is not carried (the
  exercise is `unmapped`, and the summary says so). A name that exactly matches an exercise already
  here uses that one.
- **Left out, and said so:** unfinished sessions, sets that were planned but never completed,
  exercises with no completed sets, routine rows pointing at an exercise the file does not have,
  measurements that are not a positive value of a known kind; settings, bars and plates are not
  imported.
- **Engine/batch changes:** parsed types gained RIR, side, pairId, exercise hints, rest seconds,
  the source's own offset and paused time, routines and measurements. `buildImportBatch` now also
  returns routines (a routine whose name is already used is skipped) and measurements (skipped when
  the same metric, time and value exist). `applyImportBatch` returns an untouched collection as the
  same array, so the store sees no change there.
- **Settings:** "Import a backup from another app (JSON)". The label carries no source brand name.
  It only adds; it never replaces (Replace stays the `lockd-backup` flow with its safety copy).
- **Tests:** 18 in `repforge.test.ts` (synthetic fixture `src/test/fixtures/repforge/`, mutation
  checked: sign, status, completed filter, hints, both dedupes, unknown muscle, RIR) and an e2e case
  (import, again adds nothing, a bad file is refused with the path). The demo log already has a
  routine called Push Day, and the e2e asserts it is not doubled.
- **Not verified:** a real backup file from the other app; the fixture follows its published schema.

### 2026-09-29 — Plan PR 7c: Hevy CSV importer

- **`src/lib/import/hevy.ts`:** a source profile on the 7b engine (`start_time`, `title`,
  `exercise_title`, `set_type`, `weight_kg`/`weight_lbs`, `distance_km`/`distance_miles`,
  `duration_seconds`, `rpe`, `superset_id`, `exercise_notes`, `description`, `end_time`). Set types
  are mapped by exact word (`normal`, `warmup`, `failure`, `dropset`); anything else is reported and
  imported as a working set, never silently. A zero or empty external load is read as **missing**
  (new `zeroWeightIsMissing` on the profile), so a pull-up never becomes a 0 kg set or tonnage.
  Sessions with the same title are told apart by start time; the session length comes from
  `end_time`. Distance, duration, RPE and superset are carried into the stored rows.
- **Bug fixed in the engine (also affected Strong):** the lifter's unit setting overrode the unit in
  the file's header, so a pounds file imported by a kilogram user was read as kilograms. The header
  now wins and the setting is only the fallback for a file that does not say. Tests added for both.
- **Settings:** an "Import Hevy CSV" input next to the Strong one; both reset their input so the
  same file can be chosen again. The wizard (mapping, Resolve, Bulk Classify) is still 7e.
- **Tests:** 21 in `hevy.test.ts` (both synthetic samples read in full, the lb file is the same
  sessions as the kg file, set types, zero/blank loads, quoted commas, same-title sessions,
  superset into stored blocks, re-import adds 0), mutation-checked, and a Hevy case in
  `e2e/import-csv.spec.ts`.
- **Verification label:** checked only against the two synthetic samples and the documented layout;
  **not validated against a real Hevy export.** Hevy's help article does not publish a column
  schema. A pound value of 110.2 lb imports as 49,986 g, as written, not rounded to 50 kg.
- **Not done:** a Hevy export in a language other than English, or with columns beyond the samples.

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

### 2026-09-29 — Cleanup: unused files removed (owner request)

- **Removed:** `AGENTS.md` (its content, updated, is now `CLAUDE.md`, the one file Claude Code loads);
  the `.grok/` folder (its only file was a platform deploy flag, `deploy.database`; `with-app-env`
  already tolerates it missing, and `.gitignore` now ignores `.grok/` so the platform cannot re-add
  it unnoticed); `startup.sh`; the sandbox tooling nothing imports: `scripts/preview.mjs`,
  `preview-thumbnail.mjs`, `browser-smoke*`, `browser-guard`, `write-atomic*`, Grok's own
  `brand-check.mjs` (ours is `lockd-brand-check.mjs`), and the `preview:restart` and `preview:stop`
  npm scripts; and a tracked `test-results/.last-run.json`. Each was checked for references first.
  The legacy suite has fewer failures (12, from 16), because failing tests went with their files.
- **Kept on purpose, and why:** `server/middleware/grok-pwa.ts` and `scripts/grok-pwa-*`. They look
  like scaffolding, but they inject the **share-card OG and Twitter tags for `/s/*` and `/u/*`**;
  those pages set none of their own, so removing the middleware would end link previews for shared
  receipts. They also add the `grok.com` script to every page (see the 6a entry). Removal needs the OG
  tags built into those two routes first. `sign-out-plan.mjs` is imported by `src/lib/auth/client.ts`;
  `with-app-env`, `app-env-plugin` and `check-auth-invariant` belong with the auth-behind-config
  work. All of this is plan PR 12.
- The Codex handoff (`CODEX-HANDOFF.md`) was never in this repo; it was deleted from the planning
  repo's branch too. Root `HANDOFF.md` is the app-builder era's handoff (dated 2026-09-22) and is still
  here: plan PR 13 rewrites it from the code.
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
