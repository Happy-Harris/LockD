# Consolidation plan — Lock'd

Phase 1 output, 28 Sep 2026. Companion to [FEATURE-MATRIX.md](FEATURE-MATRIX.md).
Nothing in Phase 2 starts until you approve this plan and answer the decisions in
[§ 8](#8-decisions-i-need-from-you).

## 1. The short version

Lockd is the right product base: the engines are real, and the ideas behind Ghost, Chronicle and
the Progression Engine are good. But the export has more broken or misleading behaviour than the
handoffs suggest. Four problems can lose data or break a core screen **today**:

1. **The Train tab crashes.** `/routines` and `/routines/:id` render only the error boundary
   ("Maximum update depth exceeded"). One-line selector bug.
2. **Signing in can erase the local log.** `replaceFromCloud` overwrites local data with no merge and
   no backup, and an onboarded-but-empty cloud vault counts as "has a log".
3. **One mis-tap loses a workout or a set.** Discard has no confirm; long-press on the complete
   button deletes the set with no undo.
4. **Strong CSV import corrupts European exports** (weights lost, reps wrong, day/month swapped)
   and silently merges dumbbell into barbell lifts.

A fifth issue costs money rather than data: the guest Lab endpoint is an **unauthenticated proxy to
the xAI key**.

Beyond those four, several numbers the UI shows are not honest yet: "Fresh" for muscles with no
data, unsourced MEV/MAV/MRV and strength bands, an estimated 1RM labelled "LOAD", PRs on the first
exposure, kg labels for lb users. And the Chronicle's era detection mostly isn't detecting: the
demo's five eras are hand-named in `demo.ts`; on the same log the detector finds two.

Strong-Pro supplies what the handoffs promised it would, with one correction: its domain maths
wasn't forked and diverged, it was **copied and lost its tests**. `units`, `oneRepMax`,
`plateCalculator`, `warmup` and `ids` are logically identical. The real divergences are `time`
(the timezone-offset **sign is opposite**), `volume` (Lockd's counts assisted sets as tonnage),
`taxonomy` and `types`.

knurl-os supplies the identity cleanly (tokens, self-hosted fonts, mark) and little else worth
taking; its maths uses float kilograms.

## 2. Baseline

| Repo | Checks | Result |
|---|---|---|
| Lockd `e86a95f` | `npm ci` | **fails** (lockfile out of sync) — `npm install` used for everything below |
| | `typecheck` / `build` | pass / pass |
| | `lint` | **6 errors**, 8 warnings (incl. conditional hooks in `s.$id.tsx`) |
| | `test` | 195 tests: **179 pass, 16 fail**; every test covers Grok scaffolding; **0 cover product logic** |
| Strong-Pro `c937bf9` | `verify` (lint + typecheck + 488 Vitest tests + build) | **pass** |
| | `test:e2e` | **24/24 pass** |
| knurl-os `f7d9e3c` | `typecheck` / `test:unit` / `test:e2e` | pass / **37/37** / **1/1** |
| | `lint` | 1 error, 3 warnings |

**Screenshots.** Lockd as a guest with the sample log, every main route plus an active workout, at
390 px and 1024 px: [`baseline/`](baseline/) (48 images, WebP). knurl-os at 390 px for the identity
comparison: `baseline/knurl-390-*.webp`. Every Lockd route logs one failed external request
(`ERR_CERT_AUTHORITY_INVALID` from the sandbox proxy; the page's only external origins are the Google
Fonts preconnects), and `/routines*` logs the update-depth crash; no route overflows horizontally.

**Data size.** One year of demo training (137 sessions) is **1,113,803 bytes** in `localStorage`.
A full `JSON.stringify` + `setItem`, which `persist` does on every set edit, averages **13 ms on a
desktop** Chromium; phones are several times slower and it grows linearly with history. At this rate
the 5 MB quota arrives after roughly 4–5 years of training, and a failed write there is silent.

## 3. Ordered PR list

Each PR: one area, own branch, tests with the code, `verify` + e2e green, 390/1024 screenshots of
touched screens against `baseline/`, a handover-log entry. No refactors mixed with ports. Nothing
deleted from Lockd without asking.

| # | PR | What | Size | Notes |
|---|---|---|---|---|
| 1 | **Guardrails** | Regenerate lockfile; Vitest + Testing Library + fake-indexeddb; Playwright; `verify` = lint + typecheck + test + build; CI; fix the 6 lint errors; SP's six subagents (paths rewritten); `docs/HANDOVER.md` log; real `AGENTS.md` + `CLAUDE.md`; brand check that fails CI on RepForge, Strong-Pro, Certified, Knurl or Grok in user-facing strings (allow-list: "Strong" as import source, internal identifiers) | M | The brand check starts **red** on the Lab copy and the "R" mark; land it as warn-only here and switch to failing in PR 10 (D11). Legacy `node --test scripts/**` suite leaves `verify` (D11) |
| 2 | **Critical fixes** (Override O5 — earlier than the suggested order) | Train tab selector; `s.$id` hook order; Discard confirm; set-delete undo; auth (or rate limit) on `askTheLab`; safety backup before `replaceFromCloud` | S–M | Each with an e2e or unit test that fails first. None touch engine maths, so they don't need characterisation first |
| 3 | **Characterisation** | Deterministic demo (`buildDemoLog(exercises, now)` takes a clock) + hand-built fixtures; snapshot tests for chronicle (eras, events, strongest, biggest jump), ghost, autopsy, progression, easier-week, DNA, queue, intelligence, recovery, landmarks, standards, Lockd verdict, moments, wrapped, programs, CSV import/export, store actions (start from template/program, complete set, finish, discard, import/merge) | L | Tests pin **current** behaviour, bugs included, so every later fix shows up as a reviewed test diff |
| 4 | **Domain layer** | Port SP tests for units/1RM/plates/warm-up; merge `time` (ranges + tests; Lockd's stored tz sign documented); port SP `volume`, `records`, `exerciseTaxonomy`; union `types`; evidence catalog + tests | M | `volume` changes hard-set counts: review diffs from PR 3 |
| 5 | **Durable storage** | Dexie + `LockdRepository` + one-time `localStorage` migration per § 4 | L | Highest risk; fixture tests first |
| 6 | **Offline** | Service worker per § 6; update prompt (SP #35); self-hosted fonts; own manifest + icons; offline cold-start e2e | M | |
| 7 | **Data portability** | Backup validation (Zod 4) + merge/replace + safety backup on `lockd-backup`; importers for `repforge-backup` v1 and knurl-os vault v1; SP Strong CSV wizard (mapping, fingerprints, Resolve, taxonomy suggestions); Bulk Classify; SP CSV exporter; seed library → 92 with versioned top-up | L | Fixtures: SP's three Strong CSVs, an SP backup, a knurl vault |
| 8 | **Analytics** | SP Weekly Verdict (golden fixtures), training flags, muscle sets + evidence sheets, deterministic Ask the Lab; one lens module (Lockd's 6 presets choose blocks; goal lifts from SP picker); progression merge (§ 7, I-20); recovery copy; landmarks → muscle sets; standards → ratio | L | Split into 3–4 PRs if the diff grows |
| 9 | **Logging details** | Per-set targets (SP module), supersets, unilateral, RIR mode, rest-timer notification/vibrate, equipment editor, increment per exercise, input fixes (I-26 to I-31) | M | Checked against principle 1 with a timed e2e |
| 10 | **Visual identity** | knurl tokens, fonts, mark as `LockdMark`; receipt/perforation/poster motifs restyled; poster layout made pure + tested with long lift names; Oxide discipline | M | Screenshots of every screen |
| 11 | **Approved improvements / overrides** | One PR each (§ 7) | S–M each | Slotted into 2/8/9 where they belong |
| 12 | **Scaffolding removal** | Grok scripts, middleware, preview bridge, app-data, multiplayer, pill; auth and cloud behind config | M | § 5 |
| 13 | **Cleanup** | Unused deps, dead duplicates, `README.md`/`HANDOFF.md` rewritten from the code (incl. every formerly undocumented feature), final matrix decisions, summary of what came from where | S | |

## 4. Storage migration design

### Architecture (Override O1)

The prompt says to adopt Strong-Pro's `RepForgeRepository`. I recommend adopting its **storage
discipline** but not its **API**.

- **What the doc says:** port the Dexie schema "behind the `RepForgeRepository` interface".
- **What I propose:** keep Zustand as the in-memory working set, and replace only its persistence
  with a Dexie-backed `LockdRepository` port:
  `load(): Promise<GymData>`, `apply(changes: ChangeSet): Promise<void>`,
  `replaceAll(data)`, `importBatch(batch)`, `safetyBackup(reason)`, `meta()`.
  Implementations: Dexie (web), in-memory (tests), SQLite (Capacitor, later).
- **Why:** `RepForgeRepository` is an async, per-screen query API
  (`getWorkoutDetail`, `listWorkouts`, …). Every Lockd engine — chronicle, DNA, autopsy, verdict,
  queue — takes the whole log as synchronous arrays, and ~25 routes read the store directly.
  Adopting the query API means rewriting every screen and making every engine async, for no
  user-visible gain: the engines need the full log in memory anyway.
- **What it costs:** memory holds the whole log (a 5-year log is a few MB; fine). Boot reads every
  table once (budget: < 500 ms for a synthetic 5-year log at 4× CPU throttle, asserted in e2e).
- **What it could break:** the seam for native SQLite is narrower than SP's; a SQLite adapter
  implements five methods instead of forty, which is simpler, not harder.

### Schema

New IndexedDB database **`lockd`** (a new identifier; nothing renamed). The clip vault stays in its
own database **`lockd-vault`**, untouched. Tables mirror `GymData`:

| Table | Key | Indexes |
|---|---|---|
| `exercises` | `id` | `name`, `isCustom`, `isArchived` |
| `templates`, `templateExercises` | `id` | `templateId`, `exerciseId` |
| `workouts` | `id` | `status`, `localDate`, `startedAt`, `templateId`, `programId`, `importFingerprint` |
| `workoutExercises` | `id` | `workoutId`, `exerciseId`, `[exerciseId+workoutId]` |
| `workoutSets` | `id` | `workoutId`, `workoutExerciseId` |
| `measurements` | `id` | `[metric+recordedAt]` |
| `plates`, `bars` | `id` | — |
| `programs`, `programWeeks`, `programSessions`, `programExercises` | `id` | `programId`, `programSessionId` |
| `eraNames` | `startDate` | — |
| `machineSetups` | `exerciseId` | — |
| `lessons`, `namedPrs`, `clips` | `id` | `exerciseId`, `setId` |
| `kv` | `key` | settings, restTimer, labLast |
| `meta` | `key` | schemaVersion, migratedFrom, migratedAt, sourceChecksum |
| `safetyBackups` | `id` | `createdAt`, `reason` |

Versioning follows SP: every change is a new `version(n).stores().upgrade()` block, never
destructive, each with a test and an old-format fixture.

### Write path

A store subscriber compares the previous and next state **by reference per collection**. Zustand
updates are immutable, so unchanged rows keep their identity. It then writes only the changed rows
(`bulkPut`) and removed ids (`bulkDelete`) in one `rw` transaction. Writes are coalesced per
animation frame and flushed on `visibilitychange`/`pagehide`. A set edit becomes a one-row write
instead of a 1 MB rewrite. A `BroadcastChannel('lockd-log')` tells other tabs to reload changed
tables.

### One-time migration from `localStorage`

Runs in `GymGate` before hydration, under `navigator.locks.request('lockd-migrate')` so two tabs
can't both migrate.

1. Open `lockd`. If `meta.migratedFrom` is set, load from Dexie and stop.
2. Read `localStorage['lockd-v1']`. Absent: fresh install, seed, set
   `meta.migratedFrom = 'fresh'`, stop.
3. Parse `{ state, version }`. Unparseable: **do not migrate, do not delete, do not seed over it.**
   Boot from the old `persist` path (kept for one release as a fallback adapter) and show a
   recoverable error with a "download raw data" button.
4. Run the existing persist `migrate` chain as a pure function
   `migratePersisted(state, version) → GymData`, extracted from `store.ts` unchanged.
5. **Safety backup:** write the raw `localStorage` string to `safetyBackups`
   (`reason: 'pre-migration'`) *before* writing any log rows. Settings shows "Download the copy taken
   before the move" until the user dismisses it. (A browser can't start a download without a user
   gesture, so we offer it rather than force it.)
6. Write every collection in **one** Dexie transaction.
7. **Verify:** re-read from Dexie and compare a canonical checksum against the source: per-collection
   counts plus an FNV hash over sorted `(id, weightG, reps, durationSeconds, distanceM,
   isCompleted)` for sets and `(id, status, localDate)` for workouts. On mismatch, clear the new
   tables, keep running from `localStorage`, report it.
8. Set `meta.migratedFrom = 'localStorage:lockd-v1@v{version}'`, `migratedAt`, `sourceChecksum`.
   Stop writing to `localStorage`, but **keep the `lockd-v1` key untouched**.
9. The old key is deleted by a later, separate PR. Condition: at least 30 days after release, and
   only on devices with ≥ 3 successful boots from Dexie since migration. That PR has its own test.

**Rollback.** (a) In-app: Settings → "Restore the copy taken before the move" runs
`replaceAll(migratePersisted(raw))` after taking a fresh safety backup of the current Dexie state.
(b) Deploy rollback: an older build reads the untouched `lockd-v1` key, but it won't see sessions
logged after migration. Those stay in Dexie, and re-deploying the new build picks them up because
`meta` says "migrated". The release notes say this plainly.

**Fixture tests** (Vitest + fake-indexeddb):

| Fixture | Source |
|---|---|
| `persist-v3-demo.json` | Real `lockd-v1` payload captured from the current build after "Open with a sample log" |
| `persist-v3-active-workout.json` | Real payload mid-session: active workout, half the sets completed, rest timer running, one clip attached |
| `persist-v3-imperial-custom.json` | Real payload: imperial settings, custom exercises, a Strong CSV import, machine setups, lessons, named era |
| `persist-v2.json`, `persist-v1.json` | **Reconstructed** by removing the fields `migrate()` backfills. The history that would show the true v1/v2 shapes is gone (single-day re-upload), so these are best-effort; `migrate()` is shape-tolerant, and the tests assert that |
| `persist-corrupt.txt`, `persist-empty-state.json` | Hand-built failure cases |

Assertions: row-for-row equality after migration, checksum match, the active workout resumes with
the same timer `endsAt`, a second boot doesn't migrate again, and the `lockd-v1` key is byte-identical
afterwards.

### Cloud vault

`cloudGymFromState` and `replaceFromCloud` keep working unchanged, because they read and write the
in-memory store; the persistence subscriber writes whatever changes to Dexie. `replaceFromCloud`
changes every collection, so the subscriber uses `replaceAll` (one transaction). The `CloudGym`
payload and the `lockd_vaults` table are unchanged. Separately (PR 2 and I-2), `replaceFromCloud`
first takes a safety backup, and sign-in merges instead of replacing when both sides have sessions.

## 5. Running with no Grok environment

Goal: `npm run build && npm start` with **zero** environment variables gives a complete guest app.
Sign-in, locker, public links and the server Lab appear only when configured.

1. **One config module**, `src/lib/config.ts` (server) plus a `getPublicConfig` server function
   (client):
   `auth = BETTER_AUTH_SECRET && provider credentials present`,
   `cloud = auth && database reachable`,
   `lab = LAB_PROVIDER && its key`.
   When the server is unreachable (offline), the client falls back to "all off".
2. **UI** reads that config. Sign-in buttons, the locker, "Publish", the cloud Lab and sync status
   are hidden, not disabled, when off. `/s/$id` and `/u/$handle` render "Public links aren't enabled
   on this deployment." `GymGate` never waits on auth when auth is off.
3. **Grok-only code off the critical path.** The broker bits of `src/lib/auth/*` move behind
   `auth.provider === 'grok'` (the default: off). `grokPwaPlugin`, the `/__grok/*` manifest, the
   preview bridge, the pill and `with-app-env.mjs` go in PR 12. Until then, `dev` and `build`
   work without `.grok/app-env.json`. (Today `with-app-env.mjs` reads it, and the 16 failing tests
   come from missing `.grok` files.)
4. **Database.** With cloud off, nothing opens Postgres or PGLite (today the server falls back to
   embedded PGLite, which on a serverless host is ephemeral). `db:migrate` already skips without
   `DATABASE_URL`.
5. **Lab provider.** `LabProvider { complete(system, brief): Promise<LabResult> }`; xAI is one
   implementation selected by `LAB_PROVIDER=xai` + `XAI_API_KEY`. The model name moves into config.
   The deterministic Lab (SP port) needs no provider and always works, offline and for guests.
6. **No new auth backend.** Supabase stays its own project; this only makes the current wiring
   optional.

## 6. Offline design

Lockd server-renders pages, so Strong-Pro's SPA recipe (`navigateFallback: 'index.html'`) doesn't
transfer as-is. Proposal:

- **Precache** the client bundle, CSS, self-hosted fonts, icons and an **app shell** document. The
  shell is a prerendered route (`/app-shell`) that renders the root layout and lets `GymGate`
  hydrate from Dexie.
- **Navigations:** network-first with a 3 s timeout, falling back to the cached shell. Denylist:
  `/api/*`, server-function endpoints, `/s/*`, `/u/*`. Public pages need the server anyway and keep
  server-rendered OG tags.
- **Update prompt:** `registerType: 'prompt'` with SP #35's fix.
- **Tooling:** vite-plugin-pwa if it supports Vite 8 when we get there; otherwise `workbox-build`
  `injectManifest` as a post-build step. Decided by a spike at the start of PR 6.
- **Proof:** a Playwright test: load once online → `context.setOffline(true)` → close all pages →
  open `/` cold → complete onboarding or resume → log a workout → see it in History and Chronicle →
  reload offline → still there.

## 7. Improvements and overrides

Ranked by impact. **Contradicts** names the doc a change goes against; "—" means no doc contradicts
it. Sizes: S < ½ day, M ≈ 1–2 days, L > 2 days.

### P0 — data loss, crashes, cost

| ID | What's wrong | Evidence | Fix | Size | Contradicts |
|---|---|---|---|---|---|
| I-1 | Train tab (`/routines`, `/routines/:id`) crashes | `baseline/390-routines.webp`; `routines.tsx:14` selector returns `templates.filter(...)` | Select the array, filter in `useMemo` | S | — |
| I-2 | Sign-in replaces the local log with the cloud copy; no merge, no backup; an onboarded-but-empty vault counts as a log; pushes are last-writer-wins | `sync.tsx`, `payload.ts: vaultHasLog` | Safety backup before any replace; if both sides have completed sessions, merge by id (sessions are append-mostly) and show what merged; `revision` compare-and-swap on push (conflict → pull, merge, retry) | M | HANDOFF describes the replace flow as designed |
| I-3 | Discard workout: one tap, no confirm. Long-press on complete: deletes the set, no undo | `workout.tsx` | Confirm sheet for discard; undo toast for set delete (SP `restoreSet` pattern) | S | — |
| I-4 | `askTheLab` has no auth: open proxy to `XAI_API_KEY` | `src/lib/lab/ask.ts` | Guests get the deterministic Lab; LLM needs sign-in + per-user rate limit (D3) | S | HANDOFF lists the "client brief" path as a feature |
| I-5 | Strong CSV import corrupts European files, drops distance, zero-fills reps, silently merges lifts, re-imports duplicate everything | Lockd's importer run on SP's fixtures (§ Evidence log) | Port SP wizard (PR 7) | L | — |
| I-6 | `localStorage` quota and write amplification | § 2 | § 4 | L | — |
| I-7 | Conditional hooks in `ProgramShare` (`s.$id.tsx:159–161`) | lint | Hoist hooks | S | — |
| I-8 | Backup import: no validation, no version check, UI offers merge only, merge is O(n²), replace takes no safety backup | `store.ts: importBackup`, `settings.tsx` | SP restore flow (PR 7) | M | — |

### P1 — number honesty

| ID | What's wrong | Evidence | Fix | Size | Contradicts |
|---|---|---|---|---|---|
| I-9 | Recovery shows **"Fresh"** for muscles with no data; hours computed at day granularity | Demo with 1 session: every untrained muscle `fresh` | "Last trained 2 days ago" / "No sets logged"; no colour states | S | — (HANDOFF: "no fake wellness scores" — this *enforces* it) |
| I-10 | MEV/MAV/MRV bands have no source; muscles without landmarks show "MEV" | `landmarks.ts`, Today tiles | SP muscle sets: research band 10–20 with citation, personal targets, "Target not set", "Unmapped" (D5) | M | — |
| I-11 | Strength standards: no source, "male-ish", linear bodyweight scaling | `standards.ts` | Drop the band; show e1RM ÷ bodyweight as a plain number with its date (D4) | S | — |
| I-12 | First-ever exposure of a lift counts as a PR: toast "new e1RM", and Chronicle PR runs are inflated | First demo session reports 4 PRs | First exposure = "first time on file" | S | — |
| I-13 | Today's goal-lift card labels an **estimated 1RM "LOAD"** at two decimals (132.71 kg) | `baseline/1024-today.webp` | Label "Est. 1RM", round to 0.5 kg / 1 lb, show source set | S | — |
| I-14 | kg hardcoded: ghost deltas, session replay, session search ("above 100"), milestone ladder ("100 kg bench"), Today's milestone filter regex | `ghost.ts`, `replay.ts`, `search.ts`, `moments.ts`, `index.tsx` | Unit-aware formatting; milestones per unit system | S | — |
| I-15 | Intelligence insights from tiny samples: "volume response" declares a winner on a 1-gram difference with 4 pairs; fatigue and rest notes have no minimum effect | `intelligence.ts` | Minimum n + minimum effect, show n ("from 6 weeks"), otherwise silent (D6) | S | — |
| I-16 | Autopsy copy claims "at similar loads" / "while the load stayed put" without checking load | `autopsy.ts` | Check the load or drop the clause | S | — |
| I-17 | **Renaming one era erases all the others**: 36 of 137 demo sessions end up in no era | Chronicle probe | Names override *labels* only; boundaries from the detector plus explicit user splits stored separately (`eraSplits`) | M | HANDOFF: "do not simplify without fixtures" — fixtures land first (PR 3) |
| I-18 | Era detection mostly isn't detecting (Override O2) | 2 eras detected vs 5 hand-named in `demo.ts` | See O2 | M | HANDOFF |
| I-19 | Lens `skillIds` silently replace the user's goal lifts on Powerbuilding (default) and Strength | `hooks.ts: trackedIds` | Lens picks blocks; lifts come from the user (SP `resolveGoalLifts`) | S | — |
| I-20 | Progression: stall measured against the **all-time** peak (every comeback looks stalled → spurious easier weeks); deload loads not buildable; next load not on the increment grid; program `linear` rule never applies | `progression.ts`, `programs.ts` | Merge: SP windowed stall rule + `nextLoadG` + receipt/claim id; Lockd actions, cadence, deload; plate-aware rounding via `reachableTotals` for barbell work | M | — |
| I-21 | Rest timer ignores the routine's and the user's rest; unsourced defaults (180/150/120/75 s) always win | `store.ts: completeSet`, `dna.ts` | Precedence: routine rest > user default; learned rest offered as a labelled suggestion (D7) | S | — |
| I-22 | "Hard set" means three things: verdict counts `working` only, muscle map counts `drop`/`failure` too, tonnage counts assisted sets | `volume.ts` | SP volume module (PR 4) | S | — |
| I-23 | Demo writes fractional millimetres (`870 − week × 1.2`) | `demo.ts` | Round | S | — |
| I-24 | Today's date header uses UTC (`toISOString().slice(0,10)`) | `index.tsx` | `localDateOf(new Date())` | S | — |
| I-25 | Autopsy headline lowercases "1RM" to "1rm" | Today screenshot | Don't lowercase titles | S | — |

### P1 — logging speed and correctness

| ID | What's wrong | Evidence | Fix | Size | Contradicts |
|---|---|---|---|---|---|
| I-26 | Workout page re-renders every second and recomputes progression + learned rest over full history per exercise; `sliceSessions` is O(workouts × sets) on every edit | `workout.tsx`, `analytics.ts` | Memoise per block; index sets by workout once; isolate the clock in its own component | M | — |
| I-27 | Weights ≥ 1,000 round-trip through locale grouping: "1,000" parses as 1 lb (also "1.000" in de-DE) | `workout.tsx` SetRow + `trimNumber` | Ungrouped formatter for editable inputs | S | — |
| I-28 | Clearing reps stores 0 | `Number("") === 0` | Empty → `undefined` | S | — |
| I-29 | Steppers use the global increment, not the exercise's (dumbbells, machines) | `workout.tsx` | `exercise.incrementG ?? settings` | S | — |
| I-30 | Template start puts the working weight into the warm-up set | `store.ts: startFromTemplate` | Warm-up row gets no prefill (or the ramp) | S | — |
| I-31 | RPE only by tapping 6 → 10 in 0.5 steps (up to 9 taps); no RIR | `workout.tsx` | Direct pick sheet; SP intensity mode `rpe \| rir \| none` (D17) | S | — |

### P2 — robustness, brand, hygiene

| ID | What's wrong | Fix | Size |
|---|---|---|---|
| I-32 | Poster text: fixed y positions after a variable-height title; no font-load wait | Pure layout (SP `prCardFields` pattern) + `document.fonts.ready` + long-name tests | S |
| I-33 | Imported programs silently drop exercises whose names don't resolve | Resolve step (reuse import candidates) or keep with "unresolved" marker | S |
| I-34 | Clip blobs orphaned on set/exercise/workout delete or discard | Delete blobs with their rows | S |
| I-35 | No equipment editor; plate maths uses seeded inventories only | Port SP `EquipmentSettings` in knurl's layout | M |
| I-36 | `SEED_LIBRARY_VERSION` never read; library changes never reach existing installs | Versioned additive top-up (SP #29 pattern) | S |
| I-37 | Server validators are pass-through; no size limits on vault or share payloads | Zod + caps | S |
| I-38 | Mark draws an "R"; fonts from Google CDN; "Grok" in Lab copy; manifest points at missing `/__grok` icons | PR 10 / 12 | — |
| I-39 | Dead code: multiplayer, `counterfactual`, `wouldBePr`, `sessionCountStreak` (returns the wrong value), `suggestNextLoad`, autopsy `short_rests`; `namedPrs` has data but no UI | Remove after asking (D16) | S |
| I-40 | 9 unused dependencies; lockfile out of sync | PR 1 / 13 | S |
| I-41 | Program `hold`/`percent_deload` rules declared, unused; programs never complete | Implement or remove; "Program complete" state | S |

### Overrides (a doc says one thing, I propose another)

| ID | Doc says | I propose | Why | Cost | Could break |
|---|---|---|---|---|---|
| **O1** | Prompt: Dexie "behind the `RepForgeRepository` interface" | Dexie with SP's migration discipline behind a narrow `LockdRepository` port; Zustand stays the working set (§ 4) | Engines and 25 routes are synchronous over the full log; SP's query API would force a rewrite with no user gain | Narrower native seam; whole log in memory | Nothing user-visible; boot time watched in e2e |
| **O2** | Lockd HANDOFF: era detection "iterated hard; do not simplify it without fixtures" | After fixtures (PR 3): thresholds relative to the lifter's own trailing baseline instead of absolute (42/38/28 sets per week); split on regime change *and* PR-density change; the demo stops seeding era names so it shows what detection actually finds | On the demo year the detector finds 2 eras (one 8 months long); the 5 users see are typed into `demo.ts`. A lifter doing 20 sets/week is "The Grind" forever | Chronicle looks different for everyone, including the demo | Era ids are `era-<startDate>` and `eraNames` key on `startDate`: a moved boundary orphans a name (handled by I-17's split model) |
| **O3** | Prompt principle 7 / HANDOFF brand | Oxide **replaces** vermillion rather than blending (see D9) | `#C45C32` vs `#C24A32` differ only in green (92 vs 74); the difference the user sees comes from *where* the accent is used. Lockd uses it for nav selection, chips and badges; the rule says live/active only | Every screen re-screenshotted | Contrast: Oxide on Mill for small text must be checked (AA) |
| **O4** | Prompt: port Strong-Pro's set prefill | Keep Lockd's (values written into new sets; ghost as placeholder); port SP's tests adapted | Lockd's is one tap fewer and satisfies "typed values win" (a typed value replaces the prefill) | — | Analytics of an unfinished workout see prefilled values: already excluded (only completed sets count) |
| **O5** | Prompt's order: guardrails → characterisation → … | Insert **Critical fixes** as PR 2 | I-1 to I-4 and I-7 lose data, break the Train tab or cost money today; none touch engine maths, so characterisation doesn't gate them | One more PR | — |
| **O6** | Prompt: "reconcile `src/domain/*`" because oneRepMax/units/plateCalculator diverged | Treat those five as identical: port tests and comments only; spend the reconcile effort on `time`, `volume`, `taxonomy`, `types` | AST diff shows no logic difference | — | — |
| **O7** | Prompt: "port e2e (offline, responsive, …)" | Port them rewritten; SP's selectors and routes don't exist in Lockd | — | — | — |

## 8. Decisions I need from you

| # | Decision | My recommendation |
|---|---|---|
| **D1** | **Where does Lockd's code live?** This session can push only to `Happy-Harris/Lock-D` (empty); push to `motivatedc-creator/Lockd` was refused | Import Lockd's history into `Happy-Harris/Lock-D` `main` as the product repo (Lockd's 20 commits are a one-day re-upload anyway), or grant this app push access to `motivatedc-creator/Lockd` |
| D2 | Approve O1 (storage architecture) | Yes |
| D3 | Guest access to the LLM Lab | Guests get the deterministic Lab only; LLM for signed-in users with a daily cap |
| D4 | Strength standards | Drop the bands; keep e1RM ÷ bodyweight as a number. Revisit only with a sourced, sex-specific, allometric table |
| D5 | MEV/MAV/MRV | Replace with SP muscle sets (10–20 research band, cited; personal targets) |
| D6 | Thin-evidence insights (volume response, fatigue, rest note) | Gate with a stated product rule (proposal: n ≥ 8 pairs and ≥ 3 % difference), always show n; otherwise say nothing. The thresholds go in the evidence catalog as `implementation_heuristic`, not as research |
| D7 | Rest timer precedence | Routine rest > user default; learned rest shown as a one-tap suggestion |
| D8 | Approve O2 (era detection) and the demo no longer seeding era names | Yes, after PR 3 fixtures |
| D9 | Brand blend | Oxide replaces vermillion; paper/receipt motifs use the Chalk light surface (`#E8E2D4` field, Mill ink); accent themes (stamp/ember/glacier/moss) removed; "loud/calm" presentation kept. Side-by-side: `baseline/1024-today.webp` vs `baseline/knurl-390-today.webp` / `knurl-390-session.webp` |
| D10 | Approve O5 (critical fixes as PR 2) | Yes |
| D11 | Legacy Grok scaffolding tests (16 red; test files the re-upload didn't include) | Leave them out of `verify` as `test:legacy`, delete with the scaffolding in PR 12. Brand check warn-only until PR 10 |
| D12 | Sign-in when both device and cloud have sessions | Merge by id + safety backup + summary ("Merged 12 sessions from this phone") |
| D13 | knurl-os unsided girths (`arms`, `thighs`, `calves`) | Add unsided metrics (additive) rather than guess a side |
| D14 | Offline approach (§ 6: prerendered shell + network-first navigations) | Yes; OG tags stay server-rendered on `/s` and `/u` |
| D15 | Keep the clip database `lockd-vault` separate from the new `lockd` database | Yes |
| D16 | Delete dead features: multiplayer, `counterfactual`, `wouldBePr`, `sessionCountStreak`; `namedPrs` (data, no UI) | Delete the first four; give `namedPrs` a small UI on the PR moment or drop it (it's in backups either way) |
| D17 | Port RIR mode from Strong-Pro | Yes (it's a donor feature, not a new one) |
| D18 | Baseline screenshots are committed with this PR (`docs/consolidation/baseline/`, 54 WebP images, 3.5 MB) so Phase 2 can compare against them | Keep them |

## 9. Risks

- **Storage migration** is the one change that can lose data. Mitigated by the safety backup, the
  untouched old key, checksum verification and real-payload fixtures.
- **Characterisation snapshots will pin bugs.** Intended: each fix appears as a test diff you can read.
- **Weekly Verdict, hard-set counts and PR detection will change numbers users have seen.** Each
  change is listed in the PR description and the handover log, with before/after numbers from the demo log.
- **Vite 8** is ahead of vite-plugin-pwa's tested range (spike in PR 6).
- **Zod 3 → 4** when porting `backupSchema.ts` (API differences in `.default`, error maps).
- **Timezone sign**: every importer of SP data flips `tzOffsetMinutes`; covered by fixtures.

## Evidence log

Commands and outputs behind the claims above, reproducible from the three clones.

- Domain identity: TypeScript AST print (comments removed, quotes normalised) of each module from
  both repos, then `diff`. `units`: only `parseWeightInput` added + line wrapping; `oneRepMax`: only
  `x`→`×` and `-`→`−` in two labels; `plateCalculator`: line wrapping only; `warmup`, `ids`: no
  difference.
- Strong CSV: Lockd `buildStrongImport` bundled with esbuild and run on
  `strong-pro/src/test/fixtures/strong-{standard,euro,messy}.csv`.
  Euro: `Kniebeuge <= undefined g x 5`, `Kniebeuge <= undefined g x 0`, date `2026-03-02` for
  `03.02.2026`. Standard: rowing set `reps 0`, distance absent.
- Chronicle: demo log via `buildDemoLog`; `buildChronicle(..., [])` → `Foundation[2025-10-06..2025-12-26] 36 | The Return[2026-01-21..2026-09-28] 101`;
  with one rename `{ startDate: '2026-01-21' }` → one era, `101/137` sessions in an era.
- First-session PRs: `detectPrsForWorkout(firstSession)` → 4.
- Recovery: `muscleRecovery(firstSessionOnly)` → every muscle `fresh`, 8 of 12 with no data.
- Storage: Playwright in Chromium 1194 after "Open with a sample log": `localStorage['lockd-v1'].length = 1,113,803`;
  mean of 10 × `setItem(JSON.stringify(state))` = 13.4 ms (390 px run) / 13.2 ms (1024 px run).
- Routines crash: console `Maximum update depth exceeded` + `getSnapshot should be cached` on
  `/routines` and `/routines/:id` at both widths.
- Evidence catalog DOIs: PubMed id conversion and citation match as listed in the matrix.
- Push access: `add_repo motivatedc-creator/Lockd (push)` → "you need push access".
