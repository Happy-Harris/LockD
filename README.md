# Lock’d

**Keep the receipt.**

A training operating system that remembers your entire lifting life — sessions, eras, PRs, programs, ghosts of previous you. Rebuilt from [Strong-Pro](https://github.com/motivatedc-creator/Strong-Pro) into a cloud-backed locker with public shares, a Lab that reads the real log, and a receipt aesthetic.

This snapshot is the Grok App Builder rewrite as of 2026-09-22. It is **not** the original Strong-Pro repo. Do not overwrite Strong-Pro with this.

## Stack

- React 19 + TanStack Start / Router / Query
- Tailwind v4, Radix, Zustand (persisted gym log)
- Better Auth (Google + X via the Grok auth broker in preview)
- Postgres: Neon when `DATABASE_URL` is set, else embedded PGLite
- Vite, Nitro (Vercel) for production

## Run locally

```bash
npm install
npm run dev          # http://localhost:8080
npm run typecheck
npm run build
```

Guest mode works with no env vars (on-device Zustand + PGLite). Sign-in, locker, public shares, and server Lab need a database and auth (see `.env.example` and `HANDOFF.md`).

## What lives where

| Path | What |
|---|---|
| `src/domain/` | Pure lifting math: e1RM, plates, volume, units, types |
| `src/lib/gym/` | Engines: ghost, DNA, autopsy, chronicle, programs, progression, moments, wrapped |
| `src/lib/cloud/` | Vault sync, public shares, locker card |
| `src/lib/lab/` | Ask the Lab brief + consult |
| `src/lib/auth/` | Better Auth + Grok identity broker |
| `src/routes/` | File-based pages (`Today`, workout, chronicle, lab, locker, `/s/$id`, `/u/$handle`) |
| `src/components/app/` | Shell, receipts, posters, rest timer, onboarding |
| `migrations/` | Auth tables + `lockd_vaults` / `lockd_profiles` / `lockd_shares` / `lockd_lab_notes` |

Read **`HANDOFF.md`** before changing anything. That file is the brief for the next model.
