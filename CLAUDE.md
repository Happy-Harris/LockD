# Lock'd — project guide

Read this before changing anything, then [docs/STATUS.md](docs/STATUS.md) (the map: what every
Step, Opp and PR label means, what is done and what is next), then the top of
[docs/HANDOVER.md](docs/HANDOVER.md) (what shipped, most recent first).

## What Lock'd is

A training operating system for people who lift for years. **Keep the receipt.** Lock'd wins as
the lifter's permanent record: it imports years of history and reads it back honestly, with every
number showing its working. Test every change against one line: *does it help a lifter trust and
understand their own record?*

## Principles (strong defaults; break one only with a written reason in the PR)

1. **Logging speed never regresses.** Big targets, one-handed, previous values inline, typed
   values win, one tap completes a set and starts the rest timer, the active workout survives a
   reload, the rest timer is computed from timestamps.
2. **History is the source of truth.** PRs, e1RM, volume, verdicts, eras and flags are derived on
   read. Logged exercises keep name/muscle/equipment snapshots.
3. **Canonical integer storage.** Grams, millimetres, metres, seconds. kg/lb are display only.
4. **Number honesty.** Every number is explainable. No invented targets, no silent muscle mapping,
   missing data stays visible (never zero, never a positive state). Lab answers cite the log.
   Deterministic engines are never replaced by a chatbot.
5. **Guest and offline keep working.** Sign-in upgrades (sync, locker, public links, Lab over full
   history); it never gates logging.
6. **One React codebase** for web now and iOS/Android via Capacitor later.
7. **Brand:** Lock'd / LOCKD / Lockd / `lockd`. Never RepForge, Strong-Pro, Certified, Knurl or Grok
   in user-facing copy (Strong only as an import source). `npm run check:brand` reports them.
8. **History is never paywalled.** Full history, charts and export are free forever. Enforced by
   `src/test/history-never-paywalled.test.ts` and an ESLint rule.

## Where things live

| Path | What |
|---|---|
| `src/domain/` | Pure lifting maths: e1RM, plates, warm-ups, volume, units, time, types |
| `src/lib/gym/` | Engines (ghost, chronicle, DNA, autopsy, progression, programs, moments, wrapped, queue, intelligence) and the Zustand store (`store.ts`) |
| `src/lib/cloud/`, `src/lib/lab/` | Cloud vault, shares, locker card; Ask the Lab |
| `src/routes/` | File-based routes (TanStack Router). Route paths are stable identifiers |
| `src/components/app/` | Shell, receipts, posters, rest timer, onboarding, command palette |
| `e2e/` | Playwright specs (phone 390 px, desktop 1024 px) |
| `docs/consolidation/` | The approved plan, feature matrix, addendum and baseline screenshots |
| `docs/STATUS.md` | The map: label scheme, Step and Opp status, decisions, terms |
| `docs/HANDOVER.md` | Handover log: what shipped, most recent first |

The app-builder scaffolding is gone (plan Step 12). Sign-in is Lock'd's own Better Auth with Google, Apple and an
email link, each switched on by its environment variables (`src/lib/auth/config.server.ts`, `.env.example`); with none
set, the app is a guest app and hides every sign-in prompt. The share-card tags for every page come from the routes
(`src/lib/og/tags.ts`).

## Commands

```bash
npm run dev          # http://localhost:8080
npm run verify       # lint + typecheck + Vitest + build: the bar for every PR
npm run test:e2e     # Playwright; CHROMIUM_PATH=/path/to/chrome to reuse a local browser
npm run check:brand  # stale brand names in user-facing strings
npm run test:legacy  # old scaffolding suites, not part of verify
```

Single tests (Vitest runs in Node with `TZ=UTC`; component tests opt into jsdom with a
`// @vitest-environment jsdom` pragma):

```bash
npx vitest run src/lib/gym/chronicle-detection.test.ts        # one file
npx vitest run -t "a layoff still starts a new era"           # one test by name
npx vitest run -u src/lib/gym/engine-characterisation.test.ts # accept an intended snapshot change
CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test e2e/import-csv.spec.ts   # one e2e file
npm run test:e2e:offline  # builds, then the service-worker suite in e2e-offline/ (port 8081)
```

`.claude/skills/run-lockd` drives the real app headlessly (screenshots at 390 and 1024 px).

## How the pieces fit

- **One store, derived on read.** `src/lib/gym/store.ts` (Zustand, persisted) holds the raw log and every
  action. Nothing derived is stored: screens call `useGymDerived()` in `src/lib/gym/hooks.ts`, which
  slices sessions (`sliceSessions`) and runs the engines (records, chronicle, progression, moments,
  intelligence). Persistence sits behind `src/lib/storage/` (Dexie repository, migration, safety backup);
  clips are separate blobs in IndexedDB `lockd-vault` (`src/lib/gym/vault.ts`) with `ClipMeta` in the store.
- **A new stored field is optional and travels in three places:** `src/domain/types.ts`, the zod schema in
  `src/lib/backup/schema.ts` (backups are validated on the way in), and the store's export/import. Old
  backups must keep loading, so add the field as optional and pin it with a round-trip test.
- **Unit-aware code takes a `WeightUnit`** (default `"kg"`) as a trailing argument; grams stay canonical
  underneath. Anything that words a weight, a threshold or a milestone must go through `@/domain/units`.
- **Server functions** (`src/lib/cloud/api.ts`, `src/lib/lab/ask.ts`) validate input with the pure functions in
  `src/lib/cloud/validate.ts` before any handler runs. Sign-in, sync and public shares are optional; guest
  mode needs no env vars.
- **Product heuristics are named constants plus an evidence claim.** A threshold that is not research
  (the thin-evidence gate, era detection, the autopsy load band) lives as an exported constant next to its
  code and as an `implementation_heuristic` claim in `src/domain/evidence/catalog.ts`.

## Working rules learned the hard way

- Read `docs/consolidation/PLAN.md` § 8 (decisions D1 to D18) before choosing any number or wording: several
  slices already have an owner-confirmed rule, and the audit row alone does not give it.
- Characterisation snapshots (`engine-characterisation`, `secondary-characterisation`) pin behaviour on the
  dated demo. An intended behaviour change shows up as a snapshot diff; read it, then update with `-u`.
- With several PRs open, every merge to `main` conflicts the top of `docs/HANDOVER.md` and the in-flight step's row in
  `docs/STATUS.md`. Keep both sides, then `grep -rn '^<<<<<<<' src docs e2e` before committing: a conflict in a
  source file (the evidence catalog has bitten once) must not ride along.
- Prettier is not enforced repo-wide and several files are not prettier-clean; do not run it over a whole
  file you are only editing in part.

## How work lands

- Follow the PR order in `docs/consolidation/PLAN.md` § 3 (as amended by `PLAN-ADDENDUM.md`).
  Label work as in `docs/STATUS.md` § 1: `Step 8d-2: …` or `Opp 2: …` in PR titles, and keep the
  status tables there current in the same PR.
- One area per PR, its own branch from `main`, tests with the code, `verify` and e2e green in CI.
- Every PR targets `main`. If stacking is necessary, tell the owner and do not merge until retargeted.
- Characterise before you change: an engine gets fixture tests pinning current behaviour before
  its logic changes, so every behaviour change shows up as a reviewable test diff.
- Any change to stored data ships a migration, a test and an old-format fixture that still loads.
- Screens you touch: 390 px and 1024 px screenshots compared with `docs/consolidation/baseline/`.
- Add an entry to `docs/HANDOVER.md`.
- Never force-push `main`. Ask before deleting a Lock'd feature.
- Keep secrets, keys and deployment URLs out of the repo, tests, fixtures and PR text. The repo is public.

**Live identifiers** (renaming any is a migration, never a cleanup): the persist key `lockd-v1`,
IndexedDB names `lockd-vault` (and `lockd` once storage lands), backup formats `lockd-backup` and
`lockd-program`, URLs `/s/$id` and `/u/$handle`, tables `lockd_vaults`, `lockd_profiles`,
`lockd_shares`, `lockd_lab_notes`.

## Subagents

`.claude/agents/`: `product-manager` (scope, Now/Next/Later/No), `domain-truth` (numbers),
`evidence-librarian` (citations checked against the source), `session-logger` (the gym-floor loop),
`data-portability` (storage, import, export, sync), `share-privacy` (sign-in, shares, OG tags, private
by default), `gym-ui` (layout, targets, identity), `e2e-qa` (real-app screenshots and Playwright),
`scaffold-cleanup` (Steps 12 and 13 removals), `handover-scribe` (HANDOVER, STATUS, PR labels),
`verify-gate` (merge gate). Delegate by area; `handover-scribe` then the merge gate run last.
