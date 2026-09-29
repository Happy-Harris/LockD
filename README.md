# Lock’d

**Keep the receipt.**

A training operating system for people who lift for years. It imports your history, keeps it as a permanent record on your own device, and reads it back honestly: every number shows its working, and nothing is estimated in a way you cannot see.

## Our promise

Your full history, charts and export are free, forever. If Lock’d ever charges for anything, it will only be for what costs money to run: sync, video storage and Lab compute.

This is enforced in code: `src/test/history-never-paywalled.test.ts` fails if any history, chart or export screen can reach a plan or entitlement check, and an ESLint rule blocks the import at edit time.

## What it is today

- **A fast logger.** Big targets, previous values inline, one tap to complete a set and start the rest timer, an active workout that survives a reload. Guest use needs no account and no network.
- **Your record, derived on read.** PRs, estimated 1RM, volume, verdicts, eras and flags are computed from the log each time; nothing derived is stored. Storage is canonical integers (grams, millimetres, metres, seconds).
- **Import and export.** Strong and Hevy CSV, two sister-app backups, JSON backup with validated restore, CSV export.
- **Reads that cite the log.** Weekly verdict, muscle sets against a personal band, plateau autopsy, progression calls, Chronicle eras, ghost sessions, moment posters and a yearly receipt. Thresholds that are product choices (not research) are named constants with an entry in `src/domain/evidence/catalog.ts`.
- **Offline.** A service worker keeps the app on the device; see `docs/OFFLINE.md`.
- **Optional sign-in.** Sync, a public locker and share links, and a server-side Ask the Lab need a database and auth. Guests get a deterministic on-device Lab that answers from the log.

## Stack

React 19, TanStack Start and Router, Zustand (the log, persisted through Dexie/IndexedDB with a safety backup), Tailwind v4, Radix Dialog, Alert Dialog and Slot, Zod, Vite, Nitro (Vercel). Better Auth and Postgres (Neon when `DATABASE_URL` is set, else embedded PGLite) for the optional cloud. Fonts are self-hosted (`docs/FONTS.md`). Tests: Vitest for units and components, Playwright at 390 px and 1024 px.

Some app-builder scaffolding is still in the tree and scheduled for removal (see `docs/STATUS.md`, Step 12). Do not build on it.

## Run locally

```bash
npm ci
npm run dev          # http://localhost:8080
```

Guest mode works with no environment variables: onboarding offers "Open with a sample log" or "Start empty". Sign-in, the locker, public shares and the server Lab need a database and auth; see `.env.example`.

## Checks

```bash
npm run verify       # lint + typecheck + Vitest + build: the bar for every PR
npm run test:e2e     # Playwright, phone (390 px) and desktop (1024 px)
npm run test:e2e:offline   # builds, then the service-worker suite
npm run check:brand  # stale brand names in user-facing strings
npx vitest run path/to/file.test.ts   # one test file
```

CI runs `verify` and the e2e suite on every push and pull request. To reuse a preinstalled Chromium: `CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

## Where things live

| Path | What |
|---|---|
| `src/domain/` | Pure lifting maths: e1RM, plates, volume, units, time, types, the evidence catalog |
| `src/lib/gym/` | Engines (ghost, chronicle, DNA, autopsy, progression, programs, moments, wrapped, intelligence) and the store (`store.ts`) |
| `src/lib/storage/` | IndexedDB repository, migration from the old localStorage key, safety backups |
| `src/lib/backup/`, `src/lib/import/`, `src/lib/export/` | Backup schema and restore, importers, CSV export |
| `src/lib/cloud/`, `src/lib/lab/` | Vault sync, shares, locker card (input validated in `validate.ts`); Ask the Lab |
| `src/routes/` | File-based routes (TanStack Router). Route paths are stable identifiers |
| `src/components/app/` | Shell, receipts, posters, rest timer, onboarding, command palette |
| `e2e/`, `e2e-offline/` | Playwright specs |
| `migrations/` | Auth tables and `lockd_vaults`, `lockd_profiles`, `lockd_shares`, `lockd_lab_notes` |
| `docs/` | `STATUS.md` (the map), `HANDOVER.md` (what shipped), `consolidation/` (the approved plan) |

## Working here

Read `CLAUDE.md` first (principles, commands, how work lands), then `docs/STATUS.md`, then the top of `docs/HANDOVER.md`. `HANDOFF.md` is the short brief for whoever picks this up next, including what has not been verified.
