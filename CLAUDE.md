# Lock'd — project guide

Read this before changing anything, then read [docs/HANDOVER.md](docs/HANDOVER.md) for current
state (what shipped, most recent first).

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
| `docs/HANDOVER.md` | Handover log: what shipped, most recent first |

Some app-builder scaffolding is still in the tree (`scripts/grok-*` and `server/middleware/grok-pwa.ts`,
which also inject the share-card OG tags for `/s` and `/u`; `src/lib/app-data/`, `src/lib/multiplayer/`,
the preview bridge). It is scheduled for removal (plan PR 12), after the OG tags move into the routes.
Don't build on it.

## Commands

```bash
npm run dev          # http://localhost:8080
npm run verify       # lint + typecheck + Vitest + build: the bar for every PR
npm run test:e2e     # Playwright; CHROMIUM_PATH=/path/to/chrome to reuse a local browser
npm run check:brand  # stale brand names in user-facing strings
npm run test:legacy  # old scaffolding suites, not part of verify
```

## How work lands

- Follow the PR order in `docs/consolidation/PLAN.md` § 3 (as amended by `PLAN-ADDENDUM.md`).
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
`session-logger` (the gym-floor loop), `data-portability` (storage, import, export, sync),
`gym-ui` (layout, targets, identity), `verify-gate` (merge gate). Delegate by area; the merge gate
runs last.
