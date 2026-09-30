# Lock'd — where the project stands

**This file is the map.** If you are a new engineer or a new AI model picking this project up, read
this first, then `CLAUDE.md` (the rules), then the top few entries of `docs/HANDOVER.md` (what the
last PRs did and did not verify). Keep this file current: update the tables in the same PR that
changes a status.

_Last updated: 2026-09-30, after `LockD#71` merged. Steps 1 to 11, 12a and 13 are done. **Paused for a new session: resume with Step 12b** (see the Step 12 row and the top of `docs/HANDOVER.md`)._

## 1. How to read the labels

Several numbering systems were in use while this was built. They are different things. Use these
forms, and only these, in PR titles, branch names, commits and docs.

| Form | Means | Defined in | Example |
|---|---|---|---|
| **Step 7b** | One step of the consolidation plan (Steps 1 to 13). A letter is a slice of a step that was too big to review as one diff. Older text says "Plan PR 7b" or "PR 7b": it is the same thing. | `docs/consolidation/PLAN.md` § 3, sliced in § 3 below | `Step 8c-1` |
| **Opp 4** | One of the owner's 11 opportunities in the document *Lock'd — Where It Can Win* (`Lock_D_Upgrades.md`, held by the owner, not in this repo). Phase 3 work is labelled this way. | § 4 below | `Opp 2: web receipt` |
| **LockD#23** | A GitHub pull request number in `Happy-Harris/LockD`. Always write the repo, because the `motivatedc-creator` account also has PRs numbered from 1. | GitHub | `LockD#23` |
| **I-20** | An improvement found in the audit. | `PLAN.md` § 7 | `I-19` |
| **D5** | A decision the plan asked the owner to make. | `PLAN.md` § 8 | `D13` |
| **O2** | An override: a place the plan departs from an earlier doc, with a reason. | `PLAN.md` § 7 | `O1` |

Going forward:

- **PR title:** `Step 8d-2: <what changed>` for plan steps, `Opp 2: <what>` for Phase 3, `Fix: <what>`
  or `Docs: <what>` for anything else.
- **Branch:** `claude/step8d2-<slug>` or `claude/opp2-<slug>`.
- **Handover entry** (in `docs/HANDOVER.md`, newest first): `### YYYY-MM-DD — Step 8d-2: <title>`.
- **Phases:** Phase 1 = the plan. Phase 2 = Steps 1 to 13. Phase 3 = the Opp items. Phase 4 = design
  docs only for the native items (Opp 7, Opp 10, and the lock-screen part of Opp 6).

## 2. Read this first (for a new agent)

1. `CLAUDE.md`: principles, commands, how work lands, live identifiers.
2. This file.
3. `docs/HANDOVER.md`: newest 5 entries. Each says what shipped, what changed for the user, and
   what was **not** verified.
4. `docs/consolidation/PLAN.md` (the plan), `PLAN-ADDENDUM.md` (owner decisions), `FEATURE-MATRIX.md`
   (where every feature came from), `HEVY-IMPORT.md` (the Hevy contract).
5. Then the code. `src/domain/` is pure maths, `src/lib/gym/` the engines and store,
   `src/lib/import/` and `src/lib/export/` portability, `src/lib/storage/` durable storage.

Standing rules (from the owner; `CLAUDE.md` has the full text):

- Every PR targets `main`. Donor repos are read-only.
- `verify` and e2e green on the current head, no unresolved review comments, no conflicts, before a
  merge. Never force-push `main`. Ask before deleting a Lock'd feature.
- Characterise before changing an engine. Any stored-data change ships a migration, a test and an
  old-format fixture.
- Live identifiers are never renamed (`lockd-v1`, IndexedDB `lockd` and `lockd-vault`, backup formats
  `lockd-backup` and `lockd-program`, URLs `/s/$id` and `/u/$handle`, the `lockd_*` tables).
- The repo is **public**: no secrets, keys, deployment URLs or private data in code, tests,
  fixtures or PR text.
- Brand: Lock'd. Never RepForge, Strong-Pro, Certified, Knurl or Grok in user-facing copy (Strong
  only as an import source). Say "a backup from another app".
- History, charts and export are never paywalled (guard test).
- Number honesty: no silent muscle mapping, missing stays missing, every number explainable.
- The owner wants short summaries ("TLDR"), and merges are authorised for this session once both
  checks are green.

Repos: the product is `Happy-Harris/LockD`. `Happy-Harris/Lock-D` holds only the planning docs.
Donors (`motivatedc-creator/Strong-Pro`, `knurl-os`) are read-only. A few early PRs (the privacy
migration and the characterisation tests) were written by another agent and landed via the
`motivatedc-creator` account.

## 3. The plan: Steps 1 to 13

State: **done**, **in flight**, **not started**. "GitHub" gives the pull request(s).

| Step | What | State | GitHub |
|---|---|---|---|
| 1 | Guardrails: verify, CI, tests, brand check, history promise | done | LockD#2 |
| 2 | Critical fixes (Train crash, unreachable screens, discard and undo, safe sign-in, Lab endpoint) | done | LockD#3, landed by LockD#4 |
| (privacy) | Private lockers by default, prerequisite for Step 3 | done | motivatedc-creator PR 1 |
| 3 | Characterisation tests for the engines and store | done | motivatedc-creator PR 2 |
| 3+ | Test suite pinned to UTC | done | LockD#5 |
| 4a to 4g | Domain layer: tests, time, volume, records, taxonomy, types, evidence catalog | done | LockD#6 to #12 |
| 4+ | History "Sets" counts every set after warm-up | done | LockD#13 |
| 5a to 5e | Durable storage: fixtures, Dexie schema and port, migration, live wiring, cross-tab sync | done | LockD#14 to #18 |
| 6a, 6b | Offline: fonts, manifest, icons; the service worker | done | LockD#19, #20 |
| 7a | Backup validation and safe restore | done | LockD#21 |
| (cleanup) | Unused files removed (AGENTS.md folded into CLAUDE.md, `.grok/`, sandbox tooling) | done | LockD#22 |
| 7b | Import pipeline; Strong CSV rebuilt on it | done | LockD#23 |
| 7c | Hevy CSV importer | done | LockD#24 |
| 7d-1, 7d-2 | Importers for the two sister apps' backups; unsided girth metrics | done | LockD#25, #26 |
| 7e | Import wizard and Bulk Classify | done | LockD#27 |
| 7f | CSV export rewrite; seed library 66 to 93 with a versioned top-up | done | LockD#28 |
| 7+ | Import keeps equipment variants apart: `Bench Press (Dumbbell)` no longer merges into the barbell Bench Press; a bracket matches the library only on that exercise's own equipment. Found on the owner's real export | **done** | `LockD#75` |
| 8a | Analytics engines ported and tested, not wired | done | LockD#29 |
| 8b | Weekly verdict and change flags on screen | done | LockD#30 |
| 8c-1 | Muscle sets and personal targets replace MEV/MAV/MRV | done | LockD#31 |
| 8c-2 | "Last trained" replaces recovery states; standards bands become a ratio | done | LockD#32 |
| 8d-1 | Goal lifts are the lifter's own, with pickers; est. 1RM labelled and rounded | done | LockD#33 |
| 8d-2 | Progression merge (I-20): windowed stall with a layoff guard, loads on the increment grid or buildable with the lifter's plates, program `linear` rule fixed | **done** | branch `claude/step8d2-progression` |
| 8d-3 | Deterministic Ask the Lab, so guests get an answer that cites the log (I-4, D3) | **done** | branch `claude/step8d3-ask-lab` |
| 9 | Logging details (sub-steps: 9a input fixes I-27 to I-30; 9b rest timers I-21 and notification/vibrate; 9c intensity pick and RIR I-31; 9d workout-page speed I-26; 9e equipment editor I-35; 9f per-set targets, supersets, unilateral): per-set targets, supersets, unilateral, RIR mode, rest-timer notification and vibrate, separate warm-up and working rest timers, equipment editor, increment per exercise, input fixes (I-21, I-26 to I-31, I-35) | **done, with carried items** (see "Open items carried by Step 9"); the logging-speed e2e is `LockD#49`: 9a `LockD#38`, 9b `LockD#40`, 9c `LockD#41`, 9d `LockD#42`, 9e `LockD#43`, 9f-1 supersets `LockD#44`, 9f-2a `LockD#45`, 9f-2b `LockD#46`, 9f-2c `LockD#47`, 9f-3 `LockD#48` | `claude/step9a-input-fixes`, `claude/step9b-rest-timers`, `claude/step9c-intensity`, `claude/step9d-workout-speed`, `claude/step9e-equipment`, `claude/step9f1-supersets`, `claude/step9f2-unilateral`, `claude/step9f2b-pair-counting`, `claude/step9f2c-unilateral-logging`, `claude/step9f3-effort-targets`, `claude/step9-timed-e2e` |
| 10 | Visual identity (sub-steps: 10a palette and accent themes retired; 10b the L mark and icons (I-38); 10c typefaces, Big Shoulders Display and Archivo; 10d pure poster and receipt layout with long lift names (I-32); 10e Oxide discipline: the accent marks live, selected and actionable things only): knurl tokens and fonts, the mark, receipt and poster motifs, Oxide discipline (D9, O3, I-32, I-38) | **done, with carried items** (see "Open items carried by Step 10"): 10a `LockD#50`, 10b `LockD#51`, 10c `LockD#52`, 10d `LockD#53`; 10e is in flight | `claude/step10a-palette`, `claude/step10b-mark-icons`, `claude/step10c-typefaces`, `claude/step10d-poster-layout`, `claude/step10e-oxide-discipline` |
| 11 | Approved improvements, one PR each: I-14, I-15, I-16, I-17/I-18/O2 (eras), I-23, I-24, I-25, I-33, I-34, I-37, I-41 | **done**: I-14 (`LockD#62`), I-15 (`LockD#60`, corrected to decision D6 in `LockD#64`), I-16 (`LockD#61`), I-17/I-18/O2 (`LockD#66`), I-23 (`LockD#58`), I-24 (`LockD#55`), I-25 (`LockD#56`), I-33 (`LockD#57`), I-34 (`LockD#59`), I-37 (`LockD#65`), I-41 (`LockD#63`). I-23 also rounds the demo arm values, and I-25 also fixes "RPE"; both wider than the plan's table says. Open owner decisions from this step are listed in § 5 | (merged) |
| 12 | Scaffolding removal: Grok scripts and middleware, preview bridge, app-data, multiplayer; the OG tags move into `/s` and `/u` first; auth and cloud behind config; D16 dead-code deletions | **12a done** (`LockD#71`): the routes state their own share-card tags, and the head-injecting middleware, its Vite plugin, the Home Screen tutorial and the third-party script are gone. The owner said yes to the OG-tag move and to the D16 deletions (2026-09-29). **12b done** (the preview bridge, `src/lib/app-data/` and `src/lib/multiplayer/` are gone). **12c done.** **12d done**: sign-in through Google, Apple and an email link, each switched on by config; the Grok broker is gone. **Step 12 is complete.** | 12b `LockD#73`, 12c `LockD#74`, 12d in review |
| 13 | Cleanup: unused dependencies, `README.md` and the root `HANDOFF.md` rewritten from the code, final decisions summary | **done** apart from what Step 12 will free: 31 unused dependencies removed (`LockD#69`, this PR), README and HANDOFF rewritten (this PR), decisions summary in § 5 | `claude/step13-readme-handoff` |

Audit items (`I-n`) not listed above as belonging to a step are finished. Done: I-1 to I-3, I-5 to I-10,
I-12, I-13, I-19, I-22, I-36, I-42 (Steps 2, 4d, 5, 7, 8b to 8d-1). Done: I-4 (the endpoint is gated and capped;
guests get the on-device Ask the Lab, Step 8d-3), I-11 (bands gone; the Today "relative" block wording is
open), I-40 (lockfile done in Step 1; unused dependencies in Step 13). In flight: I-20.

### Step 12, what is left (the resume plan)

Each is its own PR from `main`, with STATUS and HANDOVER updated in the same PR. Importers were checked with grep on 2026-09-30.

- **12b, scaffolding that is not a Lock'd feature: done.** The preview bridge, `src/lib/app-data/` and `src/lib/multiplayer/` are removed, with their `test:legacy` entries, Vitest exclude and brand-allowlist rows. The auth suites `gate-identity.test.ts` and `sign-in-gate.test.ts` stay for 12d.
- **12c, D16 dead code (owner approved): done.** `counterfactual`, `wouldBePr` (and its one characterisation test), `sessionCountStreak`, `suggestNextLoad` and the `short_rests` autopsy code are removed; none had a production caller.
- **12d, the auth broker and config-driven sign-in: done.** Sign-in now goes straight to Google, Apple and an email link (Resend), each on only when its variables are set (`src/lib/auth/config.server.ts`, `.env.example`). With none set Lock'd is a guest app and every sign-in prompt is hidden. The broker, the preview popup and bearer token, the gate identity, `with-app-env`, `app-env-plugin`, `check-auth-invariant`, `sign-out-plan` and `VITE_AUTH_ENABLED` are gone. The rest of plan § 5 (cloud and the Lab provider behind config) is not in this step.

## 4. The owner's opportunities (Phase 3 and 4)

From *Lock'd — Where It Can Win*. Labelled **Opp n**. Opportunity 5 is a promise, kept; 1, 4 and 5
are the ones the Step 4 to 8 work has been building underneath.

| Opp | What | State | Done by / next |
|---|---|---|---|
| 1 | Import-first Chronicle: Hevy and generic CSV beside Strong with mapping review; then build Chronicle straight after an import | **done** | Steps 7b to 7f (import), then `Opp 1: Chronicle after import` (import-first onboarding, a Chronicle card on the import's last step). A single session between two layoffs is a Brief Return, kept apart (owner's decision, 2026-09-30). Era names come from the record and are told apart by date, never numbered |
| 2 | Web receipt with no account: drop an export on the site, processed on the device, get a training receipt | **done** | `Opp 2: web receipt`: public `/receipt`: a Strong or Hevy CSV read in the browser into a lifetime receipt (eras, years, most-logged lifts with their source sets); "Continue in Lock’d" imports it into the guest log. No request carries the file (e2e) |
| 3 | Explained progression: a deterministic next target with a "why" that cites the sessions behind it; handles missed sessions, failed reps, swaps | **done** | Step 8d-2 is the engine fix underneath. `Opp 3: explained progression`: every call carries the sessions it read (`cites`), linked by date to History on Today's Next targets, the Lab and the lift page; program swaps say which lift they stand in for; case fixtures for missed sessions, failed reps, swaps and deloads |
| 4 | Numbers show their working: tap any e1RM, volume, PR or trend for the formula, the sets used, what was excluded; stall with stated confidence | **done** | verdict, flags and muscle sets each open a receipt (Steps 8b, 8c-1). `Opp 4: numbers show their working`: the e1RM on the lift page and the Data Lab, and each new record after a session, open one receipt sheet (formula, source set, every set used and every set left out with the reason, the best before, the lift's estimate session by session); a stall says "N sessions against the N before them" and gives the prior sessions' dates |
| 5 | History never paywalled: a public promise, full history, charts and export free forever; a read-only API or MCP connector later | **done** except the connector | promise in Settings, guard test `src/test/history-never-paywalled.test.ts`, CSV export (Step 7f) |
| 6 | In-set speed parity: separate warm-up and working rest timers, lock-screen rest timer, repeat last session, typed values win | **web part done**; lock-screen timer is a design doc | The web part shipped in Step 9 (separate warm-up and working rest, typed values win) and "Repeat last session" already existed. The lock-screen timer needs the native shell: `docs/design/lock-screen-rest-timer.md` (Phase 4) |
| 7 | Watch companion (native SwiftUI, then Wear OS) | design doc only | Phase 4: `docs/design/watch-companion.md`. Funding the native project is the owner's call |
| 8 | Comeback mode: detect layoffs, suggest re-entry loads, PRs "since comeback" | **done** | `Opp 8: comeback mode`: after 14+ days away each lift restarts at 90 / 80 / 70 % of its last working load by the length of the break (A-7, DA-3), rounded down to a buildable load, stated as a rule and editable in Settings; a Comeback card on Today with the records set since the return; "Within reach" leaves out lifts still restarting |
| 9 | Shareable receipts: private by default, a share card, a read-only link | **done** | Private by default and unpublish: the privacy PR (29 Sep). `Opp 9: shareable receipts`: a read-only history link for a coach or partner (`/h/$token`, unguessable, revocable from the Locker, sessions and sets only, no locker), and the lifetime receipt (Opp 2) as a share (`/s/$id`, kind `lifetime`, owner's choice 2026-09-30). The "your locker is now private" notice now clears when the owner publishes on purpose |
| 10 | Health context: bodyweight, sleep, HRV overlays in Chronicle, no readiness score | design doc only | Phase 4: `docs/design/health-context.md` |
| 11 | Program from text: paste a program or spreadsheet, get a routine with progression | design doc only | Phase 4: `docs/design/program-from-text.md` |

Phase 3 items that are not an Opp (`PLAN-ADDENDUM.md` § 6):

| Item | What | State | Done by / next |
|---|---|---|---|
| Lab, cited (item 10) | Audit that every Ask the Lab answer cites the log | **done** | `Lab, cited`: strength, training-volume and muscle answers link the sessions behind them; verdict and flag answers use the lifter's lens as the cards do; catalog answers are labelled as from the catalog; the model's note is labelled as not computed; the brief writes loads in the lifter's unit; the hit rate shows "—" when no tracked lift has sessions |
| Text size, steps A and B (items 1, 9) | A text size setting; the 9 and 10 px elements raised to 11 px | **done** except the checks on real devices | Spec: the owner's *Text Size & Lift Math, Spec v2* (Appendix A, received 2026-09-30; held by the owner, not in this repo). `Text size, step A`: role tokens, a pre-paint script, a device-only setting in Settings → Appearance, Standard unchanged. `Text size, step B`: Comfortable is the default; a lifter who never chose is told once ("Text is larger now…", with "Keep previous size"); the control is on onboarding beside units (A-3) and in the palette; every 9 and 10 px element is now 11 px or more; light-theme secondary text darkened to pass 4.5:1. Not done: real phones and tablets, iOS Dynamic Type and Android font scale (the Capacitor spike), a "Match system" option |
| Lift Math, steps A and B (items 2, 8) | A calculator on the shared e1RM core (`e1rmExact`) | **done** | `Lift Math, step A`: `src/domain/liftMath.ts`, the maths with no screen, passing every vector in the spec. `Lift Math, step B`: `/tools/lift-math`, estimated 1RM from a set (with its RPE or RIR) or the load for a target set; a receipt line and the other formula under each result; nearest loadable with ties down; a loads-only percentage table; plate and warm-up links carrying the load in the address; palette entry with synonyms; opens offline. Next slice (not planned yet): seed from history |

The owner's document sets the order: stabilise first (Steps 1 to 13), then Opp 1's Chronicle,
Opp 2, 8, 9, 3, then the native items. It says: finish the stabilise-and-QA work before adding any
item except 5 and the import work.

## 5. Decisions and open questions

Plan decisions D1 to D18 are in `PLAN.md` § 8. The owner said "start phase 2" once the plan was
delivered, and confirmed D4, D5 and D6 explicitly on 2026-09-29 ("replace as planned"); the others proceeded
on the plan's recommendation. Where a step made a product call the plan did not settle, its
handover entry says so. The open ones:

- **Lens to verdict wording** (Step 8a): strength → "strength", hybrid → "maintain", the rest →
  "build". One function, `verdictFraming` in `src/lib/gym/lenses.ts`.
- **Default goal lifts** (Step 8d-1): a new log starts with bench, squat and deadlift, which the
  verdict calls "chosen". Whether that default should be empty is the owner's call.
- **OG tags and the Grok middleware** (Step 12): approved and done in 12a. Share and locker cards now come from
  the routes; the card image is `public/og.png`, drawn by `scripts/make-icons.mjs`.
- **Root `HANDOFF.md`**: rewritten from the code in Step 13 and kept.
- **Dead code (D16)**: multiplayer, `counterfactual`, `wouldBePr`, `sessionCountStreak`. Deleting
  needs the owner's yes.
- **Step 11 numbers that are the owner's to approve** (all named constants, one edit each): the era-detection rules
  (`ERA_*` in `chronicle.ts`, catalog claim `era-detection-rules`); the autopsy "similar load" band of 5%
  (`SIMILAR_LOAD_TOLERANCE`); the pounds milestone ladder (`LADDERS` in `moments.ts`); the server size caps
  (`validate.ts`: vault 64 MB, public share 256 KB; `history-link.ts`: 10 live read-only links per lifter, 30 sessions a
  page); and D6's two readings (3% measured against the lift's e1RM, and a
  floor of 3 observations per group).
- **`percent_deload`** (I-41): a program rule kind that is accepted in files and does nothing. Keep as an alias of the
  default deload, or drop from the type and ignore it in files?
- **Text size and Lift Math, the spec's seven decisions** (taken as the owner's spec recommends, 2026-09-30):
  text size is device-local (in backups, never synced); presets are relative to the platform base with the Capacitor check
  left to the native spike; role tokens in rem with the root untouched; the role table decides which surfaces scale
  (set-row numerals and tab labels capped, display fixed); Lift Math takes RIR, or RPE as RIR = 10 − RPE in the log's
  half steps; loads round to the nearest step with ties down, in the unit typed; Tools v1 is the Plate calculator, the
  Warm-up generator and Lift Math, and a new tool must name the training decision it helps with.
- **`eraSplits`** (I-17): the plan's hand-made era splits have no UI or data yet; not built.
- **One-session eras** (Opp 1): decided 2026-09-30. Kept separate, never folded into a neighbour, and labelled a
  Brief Return.
- **`short_rests`** (I-16): deleted in 12c.
- **Real-file validation**: the Strong importer was run on the owner's own export on 2026-09-30 (597 sessions,
  13,319 sets, 2019 to 2025; the file is private and not in the repo). Hevy and the sister apps are still verified
  against synthetic or donor fixtures only. Say so if you extend them.

## 6. Where things are checked

- `npm run verify` (lint, typecheck, unit tests, build) and Playwright e2e (390 px and 1024 px) run
  in CI on every PR. `npm run test:e2e:offline` runs the offline suite against a build.
- Tests run with `TZ=UTC` pinned (a few tests set another zone deliberately).
- Locally, `CHROMIUM_PATH=/path/to/chrome npx playwright test` reuses an installed browser.
- Characterisation snapshots live beside their tests. A behaviour change should show up as a
  reviewed snapshot diff explained in the PR and its handover entry.

## 7. Terms

- **Receipt**: the working behind a number (the sets, the formula, the limits). Also the shareable
  card. The handover entry says which sense when it matters.
- **Lab**: Ask the Lab. **Data Lab**: the `/analytics` screen. **Chronicle**: eras, PR runs, layoffs,
  strongest periods.
- **Lens**: one of six presets (Powerbuilding, Strength, Hypertrophy, Calisthenics, Hybrid,
  General). It chooses which blocks the home screen shows and how the verdict is worded. It never
  changes a number or which lifts are tracked.
- **Goal lifts**: up to three lifts the lifter picks. Tracked by the verdict, flags and progression.
- **Hard set / credited set**: a completed working set. A secondary muscle gets a fractional credit
  (0.5 by default).
- **e1RM**: estimated one-rep max, with its source set. A snapshot (of a logged exercise) is the
  name, muscle and equipment it had when it was logged; it is not a test snapshot.
- **Fingerprint**: the hash of an imported session, so re-importing adds nothing.
- **Sister apps** (donors): the two earlier apps whose backups Lock'd can import. Never named in
  the UI.
- **Characterisation**: tests that pin what the code does now, bugs included, before changing it.
- **Unmapped**: an exercise with no muscle group yet. Never treated as low, never invented.

## Open items carried by Step 9 (added 2026-09-29)

- **Step 9 acceptance:** `e2e/logging-speed.spec.ts` now checks principle 1 in CI at 390 and 1024 px: one tap per set for a
  whole repeated workout, tap to rest timer within 1.5 s (about 0.44 s measured locally, an upper bound), previous values
  inline, typed values win, and the active workout and rest timer survive a reload. Its time budget has never been seen
  to fail, so treat it as a tripwire for large regressions only.
- **Per-set targets are not built as the plan describes.** 9f-3 only shows the routine's existing RPE or RIR target. A
  different target for each set needs the donor's module (not reachable) or a new stored structure and a migration.
  No screen edits `targetRpe`/`targetRir`, so today they come from imported routines only.
- **Workout-page screenshots:** 9c, 9d and 9f-1 changed the workout page without 390/1024 px screenshots. The
  `run-lockd` driver can now reach `/workout` (`WORKOUT=bilateral|unilateral`), and 9f-2c looked at it at 390 and 1024
  px; 9c, 9d and 9f-1 were not re-shot, and none was compared with `docs/consolidation/baseline/`.
- **Unilateral counting rule (owner can reverse):** the donor (Strong-Pro) is not reachable, so its rule was not ported.
  9f-2b chose one set per left/right pair. If the owner prefers two, revert `setCountKey` use in `volume.ts`,
  `weeklyVerdict.metrics.ts` and `muscleSets.ts`; `unilateral-counting.test.ts` shows the exact numbers.

## Open items carried by Step 10 (added 2026-09-29)

- **Graphite has no value in the plan,** so 10a left the card surfaces (`--rf-surface`, `--rf-raised`) as they were. Give the
  owner's value, or accept the current ones.
- **Light theme background** is still `#F4EFE6`, not the Chalk field `#E8E2D4` the plan mentions. Moving it darkens the whole light theme and
  needs a re-check of every muted and subtle text pair; not done in 10a. The light accent is a derived darker Oxide
  (`#A04C2A`, 4.6:1 or better on every light surface) because plain Oxide on Chalk is 3.3:1.
- **Oxide as small text on dark cards** is 4.0 to 4.35:1 (under AA 4.5:1; better than the vermillion it replaces). Use it for
  large text and controls there. `brand.test.ts` pins this.
- **IBM Plex Mono stays** as the data face: the plan names Big Shoulders Display and Archivo only. It is the owner's call whether
  to drop it once Archivo's tabular figures are checked in every table (`docs/FONTS.md`).
- **Canvas text can draw before its font loads:** fixed for posters and receipts in 10d; the lock-screen art (`paintLockArt`) draws synchronously and
  relies on the preload in `ThemeSync`, and truncates its label at 28 characters.
- **Oxide rule, as applied in 10e:** Oxide marks something that is live, selected or actionable (selected chips and units, the active nav item,
  the primary button, links, the accent badge, the rest-timer bar, focus rings, the PR stamp). Decorative uses were removed: the blurred glow and the
  accent tagline on login and onboarding, and the Oxide border and section label on the weekly verdict, muscle sets and change flags cards. Links stay
  Oxide (they are actionable). If the owner reads the plan's "live/active only" more strictly, links and chart bars are the next candidates.
- **Receipt perforation motif not redesigned.** The plan's "receipt and perforation motifs restyled" is not done beyond the palette, type and layout;
  the receipt keeps its existing dashed dividers.
- **"Screenshots of every screen" was met by a sweep, not by eye:** 24 routes at 390 and 1024 px (48 views) were checked for page errors and
  horizontal overflow (none; the only console error is the app-builder script that Step 12 removes). About a dozen screens were looked at:
  Today, workout, settings, lab, data, library, plates, onboarding and both posters at 1024 and 390 px as noted in the entries. Not looked
  at: the light theme, and most detail screens.
- **Seen and not fixed:** the weekly verdict sentences show a stray space before commas around the inline evidence links ("54 hard sets , in line…"),
  from the inline buttons' minimum size. The poster PNG prints the date as stored and omits a value the screen shows when a moment has no value label.

