# Handover log

State, most recent first. Read at the start of a session. Append an entry at the end of each PR:
what shipped, what it means for the next session, and anything not verified. This is a log, not a
doc to rewrite.

## Log

### 2026-09-29 — Plan PR 4b: `time`

- `src/domain/time.ts` is now Strong-Pro's module plus Lockd's helpers: date ranges
  (`resolveRange`, `previousRange`, `isWithin`, `RANGE_*`), `parseIso`, `nowIso`, `formatDate`,
  `formatDateTime`, `relativeDay`, and Strong-Pro's `elapsedSeconds` (it clamps a negative pause
  so it can't add time). Kept from Lockd: `nowParts`, `addDays`, the calendar ordinals,
  `formatLocalDate`, `formatWeekday`. Strong-Pro's 8 date-range tests are ported; 22 new tests
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
