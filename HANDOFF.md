# Handoff — Lock’d (Keep the receipt)

Give this file to the next AI along with the repo. Snapshot date: **2026-09-22**.

You are continuing **Lock’d**, not Strong-Pro. Strong-Pro is the original local-first logger at `motivatedc-creator/Strong-Pro`. This codebase is the rebuilt product.

## Product

Lock’d is a **training OS that remembers a lifter’s entire log**. Tagline is **Keep the receipt.** Do not drop that. Brand:

- Name: **Lock’d** (apostrophe). Stamp **L** mark.
- Palette: vermillion `#C24A32` on warm near-black `#0C0B0A`, paper cream `#F4EFE6`.
- Aesthetic: paper, perforation, receipts, posters — not a generic fitness dashboard.

The owner (Harris / Happy Haris, GitHub `motivatedc-creator`) explicitly rejected “local-first” as a selling point. Guest-on-device still works, but accounts, cloud vault, public locker, real share URLs, and a Lab that reads the full locker are the product.

## What is already built (do not rebuild)

Core logger (from Strong-Pro, restyled):

- Workouts, routines, exercises, RPE, rest timer, plate calculator, warm-ups
- Strong CSV import, JSON backup, body measurements
- Units (kg/lb), plate inventory, e1RM, volume, muscle taxonomy

Headline features (working):

- **Ghost Session** — overlay today vs last comparable workout set-by-set (`src/lib/gym/ghost.ts`)
- **Training Chronicle** — auto-detected eras, PR runs, layoffs, comebacks (`chronicle.ts`)
- **Lift DNA** — per-exercise profile (`dna.ts`)
- **Plateau Autopsy** — stall “why” with evidence (`autopsy.ts`)
- **Progression Engine** — next target + why + easier-week (`progression.ts`)
- **Goal Lenses** — Powerbuilding / Hypertrophy / Strength / … (`lenses.ts`)
- **Machine Memory** — seat/lever/pin setups
- **Program Compiler** — multi-week programs, substitutions
- **Moment posters / yearly receipts / wrapped** (`moments.ts`, `wrapped.ts`)
- **Live rest timer** — MediaSession + wake lock
- **Local video set vault** — IndexedDB clips + metadata
- **Ask the Lab** — client brief + signed-in `consultLab` server path (`src/lib/lab/`, `src/lib/cloud/api.ts`)
- **Cloud vault** — per-user JSON blob in `lockd_vaults`
- **Public shares** — `/s/$id` moments, receipts, wrapped, programs
- **Public locker** — `/u/$handle`, handle uniqueness

Auth is **ON**. Database is **ON**. Google + X sign-in. Guest logging still allowed.

## Architecture notes

- Gym state is a Zustand store with persist + migrate (`src/lib/gym/store.ts`, `BACKUP_VERSION = 3`). Cloud slice uses `replaceFromCloud` / `cloudPayloadFromState`. `CloudSync` debounce ~1.6s, `applyingRef` to avoid echo.
- `GymGate` in `src/routes/__root.tsx` handles splash vs onboarding vs app. Guests must **not** get stuck on “opening the locker”. Signed-in users splash until vault pull + hydration.
- Public routes (`/login`, `/s/$id`, `/u/$handle`) use `PaperShell`, not the signed-in `Page` chrome.
- Server functions: TanStack `createServerFn` + `authMiddleware`. Never trust a client-sent `userId`.
- Tables (`migrations/0002_lockd_cloud.sql`): `lockd_vaults`, `lockd_profiles`, `lockd_shares`, `lockd_lab_notes`.
- Preview vs deploy: `isWorkspacePreview()` is `!GROK_PROJECT_ID`. Auth federates through **Grok’s auth broker** (`GROK_AUTH_ISSUER`, `GROK_PROVIDERS` in `src/lib/auth/providers.ts`). **Outside Grok App Builder you must rewire Better Auth to real Google/X OAuth** (or keep email) and set `DATABASE_URL` to Neon/Postgres. PGLite is the no-config fallback.
- Do not strip `PreviewHostBridge`, `grokPwaPlugin`, or the “Created with Grok” pill while the app still lives in Grok preview. Outside Grok they are inert-ish; you may drop them in a fork.

## How to run

```bash
npm install
npm run dev        # Vite, port 8080
npm run typecheck
npm run build
```

See `.env.example`. Guest demo: onboarding → load sample log.

## Quality bar the previous session held

- `npm run typecheck` and `npm run build` pass.
- Desktop + mobile smoke. Receipt / paper UI, no generic AI-slop cards.
- Domain engines stay deterministic (ghost compare, autopsy evidence, chronicle eras). Do not replace them with a chatbot.
- Lab answers must cite the actual log (receipts), not vibe.

## Known constraints / next work

- Auth broker is Grok-specific. Standalone deploy needs real OAuth secrets + `BETTER_AUTH_SECRET` + `DATABASE_URL`.
- Vault is a full JSON blob, not incremental deltas. Fine for demo size; large logs will want deltas.
- Native Live Activities (Capacitor) not done; web timer + MediaSession is the current stand-in.
- Video clips stay on-device (IndexedDB); they are not in the cloud vault blob.
- Moment poster text wrapping has been a recurring visual bug — test long lift names (“100 kg bench”).
- Chronicle era detection was iterated hard; do not “simplify” it without fixtures.

## Original vision dump

`docs/VISION.md` is the user’s 80-idea board (Ghost, Autopsy, DNA, Chronicle, Machine Memory, Program Compiler, Live Activity, video vault, Milestone Queue, Ask the Lab, plus the rest). Prioritize quality of existing surfaces over adding 70 more half-features.

## What not to do

- Do not market “local-first” as the value prop.
- Do not overwrite `motivatedc-creator/Strong-Pro` unless the owner says so.
- Do not invent fake wellness scores. Momentum / autopsy / DNA are evidence from the log.
- Do not gate basic logging behind sign-in. Sign-in **upgrades** (sync, locker, public links, Lab with full history).
