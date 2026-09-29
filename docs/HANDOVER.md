# Handover log

State, most recent first. Read at the start of a session. Append an entry at the end of each PR:
what shipped, what it means for the next session, and anything not verified. This is a log, not a
doc to rewrite.

## Log

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
- This PR branches directly from `main` at `fa3ba3e`; it does not depend on
  the unmerged privacy PR. Browser tests/screenshots remain blocked here by the
  execution environment's network-interface/socket restrictions.


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
