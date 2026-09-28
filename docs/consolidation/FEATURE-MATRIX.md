# Feature matrix — Lockd × Strong-Pro × knurl-os

Phase 1 inventory, 28 Sep 2026. Built from the code, not the handoffs. Every claim below
was checked by reading the file, running the repo's checks, or running the module against a
fixture. The one-line proofs are in [PLAN.md § Evidence log](PLAN.md#evidence-log).

**Repos read (commit):** Lockd `e86a95f` (22 Sep, 20 commits, all from one day) ·
Strong-Pro `c937bf9` (28 Sep, PR #37) · knurl-os `f7d9e3c` (17 Sep).

**Legend.** Status: **has** / **partial** / **none**. Decision: **keep Lockd's** / **port** (take the donor's) /
**merge** (both contribute) / **drop**. **undocumented** = in Lockd's code but not in Lockd's
`HANDOFF.md` or `README.md`, so you may not know it exists. Sizes are lines of code. "0 tests"
means no test of product logic touches it.

## Baseline checks

| Repo | typecheck | lint | unit tests | e2e | build | Notes |
|---|---|---|---|---|---|---|
| Lockd | pass | **fail** (6 errors, 8 warnings) | **179/195 pass**, 16 fail; all 195 test Grok scaffolding, **0 test product logic** | none | pass | `npm ci` **fails**: lockfile out of sync with `package.json` (6 missing packages) |
| Strong-Pro | pass | pass | **488/488** (42 files) | **24/24** (Playwright, mobile + desktop) | pass | `npm run verify` green |
| knurl-os | pass | **fail** (1 error, 3 warnings) | 37/37 (`test:unit`, 7 files) | 1/1 | not run (Railway preset) | README claims a service worker; there is none |

The 16 Lockd failures all read `.grok/skills/*` or `public/__grok/*` files the re-upload didn't
include. The lint errors include conditional React hooks in `src/routes/s.$id.tsx`, which is a real
crash on the public share page, not a style nit.

---

## 1. Platform and process

| Feature | Lockd | Strong-Pro | knurl-os | Evidence of quality | Decision | Reason | Risk |
|---|---|---|---|---|---|---|---|
| App framework / router | has: TanStack Start 1.168 + Router, SSR on Nitro | Vite SPA + React Router 7 | TanStack Start (same export as Lockd) | Lockd builds; SP is the only one with CI | **keep Lockd's** | One router rule; the product lives on TanStack | SSR complicates offline (see PLAN § Offline) |
| Styling | Tailwind v4 | Tailwind v3 | Tailwind v4 | — | **keep Lockd's** | One Tailwind major | SP components get rewritten, not copied |
| State | Zustand 5 (persisted log + UI) | Zustand (UI) + Dexie (data) | Zustand (UI) + Dexie | — | **keep Lockd's** Zustand as the in-memory working set | See Override O1 | — |
| Validation | Zod 4 (barely used) | Zod 3 (backup schema, used) | Zod 4 (vault schema) | — | **port** SP schemas, rewritten for Zod 4 | Only SP validates stored data | Zod 3 to 4 API differences in `backupSchema.ts` |
| `verify` script + CI | none | has: `lint && typecheck && test && build`, `.github/workflows/ci.yml` | none | SP `verify` green locally at `c937bf9`; CI file present since 17 Sep | **port** | Guardrails first | — |
| Unit test runner | `node --test` over scaffolding only | Vitest 3 + Testing Library + fake-indexeddb | Vitest | SP 488 tests | **port** Vitest setup | — | — |
| E2E | none (Grok `browser-smoke` script) | Playwright: offline, responsive, data-transfer, tools, workout, starter-templates | Playwright: one critical path | SP 24/24, knurl 1/1 | **port** SP specs, rewritten for Lockd routes | — | Selectors all change |
| Subagents | none | 6 in `.claude/agents/` | none | Used on PRs #23–#26 | **port**, paths rewritten | — | Agent prompts name SP paths |
| Handover log | `HANDOFF.md` (a brief, not a log) | `Lockd-Claude-Handover.md`, **stale**: last entry is PR #26, but merges ran to #37 | none | — | **merge**: SP's log practice, restarted at Lockd | — | — |
| Project guide | `AGENTS.md` is the 351-line Grok sandbox contract | `AGENTS.md` real guide | Grok contract | — | **drop** Lockd's, write a real `AGENTS.md`/`CLAUDE.md` | — | — |
| Lockfile | **out of sync**: `npm ci` fails | clean | clean | reproduced | fix in PR 1 | CI can't install | — |
| Unused dependencies | 9 never imported: TanStack Query (listed in README as stack), react-table, react-hook-form, @hookform/resolvers, date-fns, react-day-picker, react-resizable-panels, vaul, cmdk, plus most Radix packages | — | similar | grep of `src/`, `server/` | **drop** in cleanup | Bundle, audit surface | none |

## 2. Storage, sync and data safety

| Feature | Lockd | Strong-Pro | knurl-os | Evidence of quality | Decision | Reason | Risk |
|---|---|---|---|---|---|---|---|
| Training-log storage | has: Zustand `persist` to `localStorage` key `lockd-v1`, version 3, `src/lib/gym/store.ts` (1,297) | has: Dexie 4, DB `repforge`, schema v2, `src/db/schema.ts`, `dexieRepository.ts` (1,091) | has: Dexie, DB `knurl-os`, v2, float kg | Lockd: 1-year demo = **1.11 MB**; full stringify+write = **13 ms on desktop Chromium, on every set edit**. SP: 5 migration tests + 27 repository tests | **merge** (Override O1): SP's Dexie schema discipline, migration tests and transactional writes behind a narrow `LockdRepository` port; Zustand stays the working set | Quota and write amplification | Migration is the riskiest PR; see PLAN § Storage |
| Persist migrations | `migrate()` ignores the version and backfills 9 fields | versioned `upgrade()` blocks, tested | versioned | Lockd 0 tests | **port** SP pattern; extract Lockd's migrate as a pure, fixture-tested function | — | v1/v2 payload shapes must be inferred (history lost) |
| Repository seam for native SQLite | none | `RepForgeRepository` (async, per-screen queries) | `repo.ts` | SP tested | **merge**: seam kept, API narrowed (O1) | Lockd's engines need the whole log in memory | — |
| Multi-tab safety | none: two tabs overwrite each other's whole blob | Dexie row-level | Dexie | — | new in storage PR (BroadcastChannel reload) | — | — |
| Clip (video) vault | has: IndexedDB `lockd-vault`, 28 MB cap, `vault.ts` | none | none | 0 tests; **blobs orphaned** when a set, exercise or workout is deleted or discarded (only `detachClip` deletes) | **keep Lockd's**, fix orphans; DB name unchanged | — | — |
| Cloud vault sync | has: full-JSON push every 1.6 s, `src/lib/cloud/sync.tsx` | none | none | **Data-loss path**: on sign-in `replaceFromCloud` overwrites the local log whenever the remote "has a log", and "has a log" is true for an onboarded-but-empty vault. Last-writer-wins across devices; `revision` column never checked | **keep Lockd's** behind config; add safety backup, merge on sign-in, revision check | Principle 5 | Sync conflicts |
| Server-side payload validation | none: validators are pass-through; no size limits | n/a | n/a | `src/lib/cloud/api.ts` | add Zod + size caps | Stored-content abuse | — |
| Destructive-action safety | Discard workout: **one tap, no confirm**. Long-press on the complete button **deletes the set, no undo**. Backup "replace": no safety backup | confirm sheets, undo toast (`restoreSet`), safety backup before replace | confirm | read + screenshot | **port** SP behaviour | Never lose the log | — |

## 3. Offline and PWA

| Feature | Lockd | Strong-Pro | knurl-os | Evidence of quality | Decision | Reason | Risk |
|---|---|---|---|---|---|---|---|
| Service worker | **none**: Grok plugin injects manifest/head tags only; manifest points at `/__grok/*` icons missing from the repo | has: vite-plugin-pwa (`registerType: 'prompt'`), Workbox precache, `navigateFallback` | **none** (README says otherwise) | SP `e2e/offline.spec.ts` passes | **port** SP, adapted to SSR | Principle 5 | vite-plugin-pwa 0.21 is on Vite 6; Lockd is on Vite 8 — verify or use Workbox directly |
| Update prompt | none | has, fixed in PR #35 ("make the update prompt actually apply the update") | none | tested in e2e | **port** | — | — |
| Fonts | loaded from **Google Fonts CDN** (Barlow, Barlow Condensed, IBM Plex Mono) | self-hosted | self-hosted woff2 (Big Shoulders 700/800, Archivo variable) | — | **port** knurl font files (OFL) | Offline + identity | Add OFL licence text |

## 4. Auth, cloud and the Lab

| Feature | Lockd | Strong-Pro | knurl-os | Evidence of quality | Decision | Reason | Risk |
|---|---|---|---|---|---|---|---|
| Sign-in | has: Better Auth federated through Grok's broker (`GROK_AUTH_ISSUER`, `GROK_PROVIDERS`) | none by design | same Grok scaffolding | 4 scaffolding test files | **keep Lockd's** wiring behind configuration; hide cleanly when unconfigured; no new backend | Supabase is its own project | — |
| Public shares `/s/$id` | has | none | none | lint: conditional hooks in `ProgramShare` | **keep Lockd's**, fix hooks, validate payload | URLs are live identifiers; never rename | — |
| Public locker `/u/$handle` | has | none | none | 0 tests | **keep Lockd's** | — | — |
| Ask the Lab (LLM) | has: xAI `grok-4.5`, `src/lib/lab/ask.ts`. **`askTheLab` has no auth middleware**: anyone can POST a 4,000-char prompt billed to `XAI_API_KEY` | none | none | read | **keep Lockd's** behind a `LabProvider` interface; guest LLM path closed or rate-limited (Decision D3) | Cost abuse, principle 5 | — |
| Ask the Lab (deterministic) | partial: `lab.tsx` renders a "local read" from the engines | has: `features/analytics/askLab*.ts` (~900) intent match to answers that cite the log and the evidence catalog | none | SP `askLab.test.ts` (328) | **port** SP as the always-on and guest tier, and as grounding for the LLM | Deterministic engines never replaced by a chatbot | — |
| Lab brief builder | has: `src/lib/lab/brief.ts` | none | none | 0 tests | **keep Lockd's** | — | — |
| Lab notes history | has: `lockd_lab_notes` | none | none | — | **keep Lockd's** | — | — |
| "Grok" in user-facing copy | "Ask Grok again", "Grok reads the locker" (`lab.tsx`) | — | — | grep | **fix** | Brand rule | — |

## 5. Domain math (`src/domain/*`)

The prompt says `oneRepMax`, `units` and `plateCalculator` have diverged from Strong-Pro. **They
haven't.** With comments and formatting stripped (TypeScript AST print), `units`, `oneRepMax`,
`plateCalculator`, `warmup` and `ids` are logically identical to Strong-Pro's. Lockd lost the doc
comments and the tests, added `parseWeightInput`, and changed `x` to `×`. The real divergence is in
`time`, `volume`, `taxonomy` and `types`.

| Module | Lockd | Strong-Pro | knurl-os | Which is more correct | Decision | Risk |
|---|---|---|---|---|---|---|
| `units` | has (135) + `parseWeightInput` | has (156) + tests (123) | `units.ts` (67), **float kg canonical** | identical logic | **port** SP tests and comments; keep `parseWeightInput` | none |
| `oneRepMax` | has (70) | has (94) + tests (94) | `one-rm.ts` + tests | identical | **port** tests | none |
| `plateCalculator` | has (217) | has (282) + tests (231) | `plates.ts` + tests (float) | identical | **port** tests | none |
| `warmup` (plate-aware) | has (150) | has (183) + tests (146) | simpler, float | identical to SP | **port** tests | none |
| `ids` | has | has | — | identical | keep | none |
| `time` | has (61): `nowParts`, ordinals | has (154): ranges, `previousRange`, formatters + tests | — | **SP more complete. The two disagree on `tzOffsetMinutes` sign**: SP stores `-getTimezoneOffset()` (+60 = UTC+1), Lockd and knurl store the raw JS value (-60 = UTC+1). Lockd never reads the field | **merge**: SP functions + tests, keep Lockd's stored sign (it's live data), flip on SP import | Importers must convert |
| `volume` | has (52): **ignores tracking type**, so assisted-weight sets count as tonnage; `hardSetCount` counts only `working` while muscle attribution also counts `drop`/`failure` | has (187): tracking-aware, assisted excluded, reps-only/duration/distance counted separately + tests (157) | `volume.ts` (47) | **SP correct** | **port** SP | Verdict numbers shift (hard-set definition) |
| `taxonomy` | has (141): drops `unmapped` from the muscle list; adds `HEATMAP_MUSCLES` | has (138) with set-type hints | own taxonomy (front/side/rear delts, obliques…) | merge | **merge** | — |
| `types` | superset for programs, eras, machine setups, lessons, named PRs, clips, `grind`, `beatWorkoutId` | has RIR (`rir`, `targetRir`), unilateral (`side`, `pairId`, `unilateralSnapshot`), `importFingerprint`, `personalMuscleTargets`, rest vibrate/notification, `ImportJob` | own shapes | merge | **merge** (union; additive fields need no migration) | — |
| `records` (PR kinds) | partial: in `analytics.ts`, e1RM and heaviest only; `kind: "reps"` declared, never computed; **first-ever exposure counts as a PR** | has (152): kinds + labels | `records.ts` + tests | SP | **port** | PR toasts change |
| `exerciseTaxonomy` (suggestions) | none | has (97) + tests (113) | none | — | **port** | — |
| Evidence catalog | none | has: `domain/evidence/*` (372) + tests; 7 sources with DOIs | none | DOIs spot-checked in PubMed (Schoenfeld 2017 PMID 27433992, Refalo 2023 PMID 36334240, Currier 2026 PMID 41843416, Pelland PMID 41343037) | **port** | — |
| `standards.ts` (strength bands) **undocumented** | has (74): no source, "male-ish" by its own comment, linear bodyweight scaling, no bands for women; shown on `library/$id` as "Intermediate / Next: Advanced at …" | none | none | 0 tests | **drop** the classification (Decision D4); keep e1RM ÷ bodyweight as a plain number | Number honesty | Feature visibly removed |
| Seed exercise library | 66 exercises; `SEED_LIBRARY_VERSION = 2` declared, **never read** | 92 exercises; unilateral backfill keyed on seed version (PR #29) | own catalog | Seed IDs are identical across repos (`seed-<slug>`, same `slugify`) | **port** SP's list + versioned top-up | New exercises reach existing installs | — |
| Starter templates | `emptyStarterPack` | `starterTemplates.ts` + tests; Upper/Lower, Low-Impact, Athletic (PR #22) | own | SP tested | **merge** | — | — |

## 6. Engines (`src/lib/gym/*`, all Lockd, all 0 tests)

| Feature | Lockd | Strong-Pro | knurl-os | Evidence of quality | Decision | Reason | Risk |
|---|---|---|---|---|---|---|---|
| Ghost Session | has: `ghost.ts` (210) | none | none | 0 tests. **Delta labels hardcode "kg"** (lb users see kg). "Beat" compares heaviest set only: 100×1 beats 97.5×10 | **keep Lockd's**; characterise, then fix units | — | — |
| Training Chronicle | has: `chronicle.ts` (405) | none | none | 0 tests. **Renaming one era erases the others**: demo log, rename era 2 → era 1 disappears, **36 of 137 sessions belong to no era**. **Detection finds 2 eras in the demo year; the demo's 5 eras are hand-named in `demo.ts`** (Foundation, Travel layoff, The Return, Volume Summer, The Grind, Iron Block) and seeded into `eraNames`. Tone thresholds are absolute (≥42 hard sets/week = "volume") | **keep Lockd's**; fixtures first; Override O2 | HANDOFF: "do not simplify without fixtures" | Eras visibly change for real users |
| PR runs / firsts / biggest jump | has (in chronicle) | none | none | First exposure of every lift counts as a PR, so every PR run is inflated | **keep**, fix first-exposure | — | — |
| Lift DNA | has: `dna.ts` (225) | none | none | 0 tests; "best weekday" from ≥2 samples per day | **keep Lockd's**; characterise; label sample sizes | — | — |
| Plateau Autopsy | has: `autopsy.ts` (163) | none | none | 0 tests. Copy claims "at similar loads" / "while the load stayed put" without checking load; `short_rests` code never produced; title lowercases "1RM" to "1rm" | **keep**; fix copy | Number honesty | — |
| Progression Engine | has: `progression.ts` (326): next target, why, easier week, deload, personal "typical exposures" cadence | has: `domain/progression.ts` (277) + tests (334): windowed stall rule shared with training flags, grid-snapped `nextLoadG`, receipt + claim id; no deload, not plate-aware (its own header says so) | none | Lockd: stall measured against the **all-time** peak, so every comeback reads as a stall; deload loads `Math.round(load × 0.9)` are **not buildable**; next load not snapped to the increment grid | **merge**: Lockd's actions and why; SP's stall rule, grid snap and receipt; plate-aware rounding via `reachableTotals` | Prompt asks for both | Calls change: test diffs to review |
| Easier-week call | has | none | none | inherits the stall bug above | **merge** with SP stall rule | — | — |
| Goal lenses | has: 6 lenses (`lenses.ts`, 76) that pick dashboard blocks; **hardcoded `skillIds` override the user's goal lifts** on Powerbuilding (default) and Strength | has: `build / strength / maintain` + `GoalLensPicker` (tested) | none | — | **merge** into one module: Lockd's 6 presets choose blocks; lifts always come from the user's pick | — | — |
| Goal lifts | partial: `settings.goalLiftIds`, no picker, overridden by lens | has: `GoalLiftPicker` + `resolveGoalLifts` ("a pick always wins; the card says which it's using") + tests | none | SP tested | **port** | — | — |
| Weekly Verdict **undocumented** in Lockd | has: `buildWeeklyVerdict` in `analytics.ts` — simplified, 0 tests | has: `weeklyVerdict.ts` (526) + presentation (615) + golden fixtures (6 files) + 21 tests + evidence sheet | none | SP golden-tested | **port** SP | — | Headline copy changes |
| Training flags (stall / spike / deload) | none | has: `trainingFlags.ts` (300) + 14 tests | none | — | **port** into Lab and Chronicle | — | — |
| Muscle sets per week | partial: `muscleSetMap`, no evidence, no unmapped handling | has: `muscleSets.ts` (236) + `MuscleSetsCard` + 10 tests; per-set evidence; states `below / in_range / above / not_set / unmapped` | none | — | **port** | Never fakes coverage | — |
| Volume landmarks MEV/MAV/MRV **undocumented** | has: `landmarks.ts` (37), no source; muscles without landmarks show "MEV"; shown on Today | replaced by the evidence-backed 10–20 set band + personal targets | none | 0 tests | **drop**; replace with SP muscle sets (Decision D5) | Population guess shown as a verdict | Today tiles change |
| Recovery / freshness **undocumented** | has: `recovery.ts` (59): hours since last trained, day granularity; **no data reported as "Fresh"** (Today shows "Fresh" above "No work yet") | none | none | reproduced on the demo | **replace** with factual copy: "Last trained 2 days ago" / "No sets logged" | Missing data shown as a positive state | Lens blocks lose a colour state |
| Milestone queue, near misses, RM table **undocumented** | has: `queue.ts` (246) | none | none | 0 tests; uses the global increment, not the exercise's | **keep**; characterise; per-exercise increments | — | — |
| Counterfactual / `wouldBePr` **undocumented** | has, **unused anywhere** | none | none | grep | **drop** (ask first, D16) | Dead code | — |
| Intelligence report **undocumented** | has: `intelligence.ts` (257): hit rate, relative lifts, left/right deltas, RPE drift, fatigue by rest gap, volume response, rest note | none | none | 0 tests. "Volume response" declares a winner on a 1-gram difference with 4 pairs; "fatigue" and "rest note" have no minimum effect size | **keep** relative lifts, L/R deltas, RPE drift; gate or drop thin-evidence insights (Decision D6) | Number honesty | Lab loses lines |
| Session replay **undocumented** | has: `replay.ts` (62) on `history/$id` | none | none | 0 tests; weight shown as `weightG/1000` (kg only) | **keep**; unit-aware | — | — |
| Session search **undocumented** | has: `search.ts` (62) in the command palette | none | none | "above 100" always means kg | **keep**; unit-aware | — | — |
| Learned rest / "rest personality" **undocumented** | has: `dna.ts`: 180 s barbell squat/hinge, 150 s barbell, 120 s other, 75 s isolation (unsourced); learned rest = mean gap between set completions (includes the set itself). **Always overrides the routine's and the user's rest setting** | none | none | read: `restPersonalitySeconds(...) \|\| we.restSeconds` never falls back | **keep** learned rest as an opt-in suggestion; routine/user rest wins (Decision D7) | Logging speed + honesty | — |
| Calendar heat, day streak | has | not compared | streak + tests | — | **keep Lockd's** | — | — |
| `sessionCountStreak` | has, **returns total training days instead of the streak it computes**; unused | — | — | read | **drop** | Dead + wrong | — |
| Program Compiler | has: `programs.ts` (434), 3 packs, `lockd-program` v1 file format | none | none | 0 tests. **Linear rule never applies** (only runs when there's no suggestion; there always is). Deload loads unrounded. Imported programs with unknown exercise names are **silently dropped** at session start. `hold`/`percent_deload` rules declared, unused. Programs never complete | **keep**; fix | — | — |
| Machine Memory | has | none | none | — | **keep** | — | — |
| Pinned lessons **undocumented** | has | none | none | — | **keep** | — | — |
| Named PRs **undocumented** | store action + `namedPrs` table, **no UI** | none | none | grep | **ask** (D16): wire a UI or drop | — | Data exists in backups |
| Set "grind" feel **undocumented** | collected per set, **never read** by any engine | none | none | grep | **keep** (data); decide later | — | — |
| "Beat this" / Repeat last | has | Repeat last | — | — | **keep** | — | — |
| Moment posters / year receipt / wrapped | has: `moments.ts`, `wrapped.ts`, `moment-poster.tsx` | PR moment card: pure layout `prCardFields` + tests | none | Lockd: title wraps from y=240 but value label and detail sit at fixed y=500/560, so a 3-line title collides (the "recurring wrap bug"); no font-load wait; milestones are kg-only ("100 kg bench") | **merge**: Lockd's moments, SP's pure-layout + test approach | — | Poster look changes with identity |
| Multiplayer (WebRTC) | `src/lib/multiplayer/*` (579), **unused** | none | same, unused | grep | **drop** | Scaffolding | — |

## 7. Active workout (logging speed)

| Feature | Lockd | Strong-Pro | knurl-os | Evidence of quality | Decision | Reason | Risk |
|---|---|---|---|---|---|---|---|
| Set row, steppers, one-tap complete | has: 44 px targets, Enter completes | `SetRow.tsx` + tests (185) | big full-width Log button | Lockd: **page re-renders every second** and recomputes progression + learned rest over full history per exercise block. Weight input re-formats with locale grouping, so values ≥1,000 round-trip as "1,000" → **1 lb**. Clearing reps stores **0**. Steppers use the global increment, not the exercise's | **keep Lockd's**, fix | Principle 1 | — |
| Previous values inline | has: prefilled into new sets + ghost placeholders | `setPrefill.ts` + tests: placeholders, accepted on complete, "existing values win" | "PREV" column | both satisfy principle 1 | **keep Lockd's** (fewer taps); port SP's tests adapted (Decision D17 note) | — | — |
| Warm-up prefill bug | template start puts the **working** weight into the warm-up set | n/a | n/a | read `startFromTemplate` | fix | — | — |
| Per-set rep targets | has: target header + in range / under / over text | `targetPrescription.ts` + tests (98) | — | — | **port** SP pure module + tests under Lockd UI | — | — |
| Supersets | **field only** (`supersetGroup`), no UI | has in `ActiveWorkoutPage` | `supersetId` | — | **port** SP | Donor feature | — |
| Unilateral sets | **flag only** (`Exercise.unilateral`), no UI | has: `side`/`pairId`, `setGrouping.ts` + tests, seed backfill | none | — | **port** SP | Donor feature | Schema additive |
| RPE / RIR | RPE only, tap-cycle 6→10 in 0.5 steps (up to 9 taps) | intensity mode `rpe \| rir \| none` | RPE + RIR | — | **port** RIR mode (Decision D17) | — | — |
| Warm-up generator | has: `ensureWarmups`, plate-aware | `WarmupPanel` | simpler | identical domain | **keep Lockd's** | — | — |
| Rest timer | has: timestamps, MediaSession, wake lock, chime | timestamps, web notification, vibrate, Capacitor local notification, clears on finish (#21) | chime + vibrate | all timestamp-based | **merge**: Lockd's + SP notification/vibrate | — | — |
| Plate calculator page | has: `tools.plates.tsx` | `PlateCalculatorVisuals` + tests | `PlateStack` visual | SP tested | **merge**: SP logic/tests, knurl visual | — | — |
| Equipment editor (bars, plates, collars) | **none**: plate maths only uses seeded inventories | `EquipmentSettings.tsx` (410) | `hardware.tsx` (collar weight) | — | **port** SP logic in knurl's layout | Plate-aware maths needs the real gym | — |
| Video set vault | has | none | none | — | **keep** | — | — |
| Session summary | has: `workout.$id.summary.tsx` | `WorkoutSummaryPage` | — | — | **keep Lockd's** | — | — |

## 8. Data portability

| Feature | Lockd | Strong-Pro | knurl-os | Evidence of quality | Decision | Reason | Risk |
|---|---|---|---|---|---|---|---|
| JSON backup (own format) | `lockd-backup` v3: export; import has **no validation or version check**, the UI offers **merge only**, merge is O(n²), no safety backup | `repforge-backup` v1: Zod-validated, 64 MB cap, merge/replace, safety backup, `pruneOrphans` | `knurl-os` vault v1 (Zod), **float kg** | SP tested | **merge**: keep `lockd-backup` format string; SP validation and restore flow | Format strings are live identifiers | — |
| Import Strong-Pro backup | none ("Not a Lock'd backup") | — | — | — | **new importer** (port-derived) | DoD | tz sign flip |
| Import knurl-os vault | none | — | — | knurl: `weightKg`, `valueCanonical` (kg/cm float), no `workoutId` on sets, `timezoneOffsetMinutes` raw sign, different muscle/metric enums, unsided girths | **new importer** | DoD | Muscle and girth mapping (D13) |
| Strong CSV import | has: `csv.ts` (417) | wizard: `strongImport.ts` (657) + tests (330), column mapping, fingerprints, "Resolve exercises", taxonomy suggestions (PR #37); fixtures: standard, euro, messy | `csv.ts` (273) + 8 tests, float | **Lockd on SP's euro fixture: weights lost (`Gewicht (kg)` not recognised), reps taken from decimal fragments (110,0 × 3 → 0 reps), 03.02.2026 read as 2 March.** On the standard fixture: distance dropped, empty reps become 0. No duplicate detection. Fuzzy match strips "dumbbell", so "Bench Press (Dumbbell)" merges into barbell Bench Press silently | **port** SP | Corrupts real data today | — |
| CSV export | has: formula guard for `= + - @` only; no distance | `exporters.ts` + `csv.test.ts` | — | — | **port** SP | — | — |
| Bulk Classify | none | has (242) + tests | none | — | **port** | — | — |
| Program file `lockd-program` v1 | has | none | none | — | **keep** (fix name resolution) | — | — |

## 9. Screens not covered above

| Feature | Lockd | Strong-Pro | knurl-os | Evidence | Decision | Risk |
|---|---|---|---|---|---|---|
| Today | has (469) | `TodayPage` | Today | Lockd: date header uses UTC (`toISOString`) so it can show the wrong weekday near midnight; goal-lift card labels an **estimated 1RM as "LOAD"** with two-decimal precision (132.71 kg) | **keep Lockd's**, fix | — |
| Train / Routines | has — **crashes**: "Maximum update depth exceeded" on `/routines` and `/routines/:id` (selector returns a new filtered array each render) | `TemplatesPage`, `TemplateEditorPage` | routines | screenshot `baseline/390-routines.webp` shows only the error boundary | **keep Lockd's**, fix now | — |
| History + detail | has | has | logbook | — | **keep Lockd's** | — |
| Library + exercise detail (DNA, RM table, setup, lessons) | has | library, editor, detail (tests) | exercises | — | **keep Lockd's** | — |
| Body measurements | has, integer grams/mm (correct); demo writes **fractional mm** (870 − week × 1.2) | measurements + detail | biometrics | — | **keep Lockd's**; round demo | — |
| Settings | has | has | system | — | **keep Lockd's**, add SP fields (RIR, notifications, week start already both) | — |
| Onboarding / command palette | has / has **undocumented** in HANDOFF | onboarding | onboarding | — | **keep Lockd's** | — |
| Themes | light/dark + 4 accent themes + "loud/calm" presentation **undocumented** | 5 accents + app icons | Mill / Chalk | — | **replace** accents with Mill/Chalk (Decision D9) | Removes a visible setting |

## 10. Identity

| Feature | Lockd | Strong-Pro | knurl-os | Evidence | Decision | Risk |
|---|---|---|---|---|---|---|
| Palette | vermillion `#C24A32`, paper `#F4EFE6`, near-black; tokens prefixed `--rf-` (RepForge) | stamp-L era | Mill `#0E0E0C`, Graphite, Chalk `#E8E2D4`, Steel `#9A9588`, Oxide `#C45C32`, Verdigris `#6E8B74`; Chalk light theme | Oxide and vermillion differ mainly in green (74 vs 92): same family | **port** knurl tokens (see PLAN D9 for the blend) | Every screen |
| Type | Barlow / Barlow Condensed / IBM Plex Mono via CDN | Barlow | Big Shoulders Display 700/800 + Archivo variable, self-hosted | — | **port** knurl | — |
| Mark | `StampMark` — **draws an "R"**, not an L (stem, bowl, diagonal leg; visible in `baseline/1024-today.webp`) | stamp L | diamond-ring lock cell (`mark.tsx`) | screenshot | **port** knurl geometry as `LockdMark` | — |
| Receipt / perforation / poster motifs | has (`receipt.tsx`, `paper-shell.tsx`, posters) | — | — | — | **keep**, restyle | Poster wrap |
| Oxide discipline | accent used for nav selection, chips, badges | — | knurl itself uses Oxide on idle Log/Start buttons (see `baseline/knurl-390-*.webp`) | screenshots | apply the rule: Oxide only for live/active | — |
| Stale names in UI | "Grok" (Lab), "Created with Grok" pill, `R` mark | "no accounts ever" copy, LOCKD.md | "Knurl" everywhere | grep | brand check in CI | — |

## 11. App-builder scaffolding (drop list)

| Item | Lockd | knurl-os | Decision | Note |
|---|---|---|---|---|
| `.grok/`, `scripts/grok-*`, `brand-check.mjs` (Grok's), `preview*.mjs`, `sign-out-plan*`, `browser-smoke*`, `with-app-env*`, `app-env-plugin`, `startup.sh` | has | has | **drop** in scaffolding PR | `migrate.mjs` + `migration-plan.mjs` stay while the cloud DB exists |
| `server/middleware/grok-pwa.ts`, `public/__grok/*`, "Created with Grok" pill | has | has | **drop** | Replaced by our manifest |
| `preview-host-bridge`, `preview-embedder-origin` | has | has | **drop** | — |
| `src/lib/app-data/*` | has (unused by product) | has | **drop** | — |
| `src/lib/multiplayer/*` | has, unused | has | **drop** | — |
| Grok auth broker parts of `src/lib/auth/*` | has | has | isolate behind config, then drop broker-only code | Keep Better Auth core for later rewiring |
| knurl `ecosystem` route, BRAND.md lore (Iron, Halls, Academy), `railway.toml` | — | has | **drop** | — |
