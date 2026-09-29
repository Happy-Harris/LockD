---
name: run-lockd
description: Run, start, launch, drive, or screenshot the Lock'd app (TanStack Start + Vite, guest/offline-first) headlessly, and run its unit and e2e tests. Use when asked to "run lockd", "screenshot Today/Lab/History", or "check a change in the real app".
---

Paths are relative to the repo root. Lock'd is a web app; the driver is a small Playwright script
(`@playwright/test` is already a dev dependency), not `chromium-cli`. Guest mode needs no account,
database or env vars.

## Prerequisites

```bash
npm ci
export CHROMIUM_PATH=/opt/pw-browsers/chromium   # preinstalled; never run `playwright install`
```

## Run (agent path)

```bash
(npm run dev > /tmp/lockd-dev.log 2>&1 &)                                   # serves :8080
for i in $(seq 1 60); do curl -sf http://127.0.0.1:8080/ >/dev/null && break; sleep 2; done
node .claude/skills/run-lockd/driver.mjs /tmp/lockd-shots                   # 5 screens × phone (390) + desktop (1024)
node .claude/skills/run-lockd/driver.mjs /tmp/lockd-shots /import /library  # or pick routes
FULL=1 node .claude/skills/run-lockd/driver.mjs /tmp/lockd-full /settings   # whole scrolled page, not just the first screen
pkill -f "[v]ite dev"                                                        # bracket trick: a plain pattern also matches (and kills) this shell
```

The driver onboards with "Open with a sample log" (a year of Push/Pull/Legs), waits for the log to
land in IndexedDB, then screenshots each route to `<outDir>/<phone|desktop>-<route>.png`. Read the
PNGs to check them; `BASE_URL` overrides the origin. To drive a flow, copy the driver's onboarding
block and use the helpers in `e2e/helpers.ts` (`openWithSampleLog`, `readLog`, `waitForSessions`).

## Test

```bash
npm run verify            # lint, typecheck, unit tests, build (what CI runs first)
npx playwright test       # e2e at 390 and 1024 px; starts `npm run dev` itself, reuses a running one
```

## Gotchas

- Navigating right after onboarding shows onboarding again: the log is written to IndexedDB
  asynchronously. Wait for sessions in the DB (the driver does) before `goto`.
- Screenshots are the first viewport only unless `FULL=1`; long pages (Settings) hide everything below the fold.
- `page.goto` is a full reload; the app is ready only when `html[data-gym-ready='true']` exists.
- First `npm run dev` request compiles on demand and can take several seconds.
- `npm run verify` ends with `db:migrate`, which skips itself without `DATABASE_URL` (expected).
- `pkill -f "vite dev"` without the bracket trick kills the calling shell (exit 144).
- The repo is public: keep screenshots and logs out of it.
