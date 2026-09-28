# Plan addendum — decisions recorded, win features, Phase 3 order

28 Sep 2026. Extends [PLAN.md](PLAN.md) (written before the "win" half of the brief existed).
PR numbers below are PLAN.md's (§ 3), not the brief's original list.

## 1. Decisions recorded

| # | Answer |
|---|---|
| D1 | **`Happy-Harris/LockD` is the product repo** (fork of `motivatedc-creator/Lockd` at `e86a95f`, the commit Phase 1 analysed). `Happy-Harris/Lock-D` PR #1 is superseded by this PR |
| D2–D15 | Yes, as recommended in PLAN § 8 |
| D16 | Delete multiplayer, `counterfactual`, `wouldBePr`, `sessionCountStreak`. Keep `namedPrs` data in backups, no UI for now |
| D17 | Yes (port RIR mode) |
| D18 | Keep the baselines |
| O1–O7 | Approved |

## 2. Spot-check before building on the plan

Re-run in this session against `Happy-Harris/LockD` at `e86a95f`. The tree is byte-identical to the
Phase 1 clone apart from build output. **Every claim checked reproduced; none failed.**

| Claim | How | Result |
|---|---|---|
| `/routines` crashes | Chromium 1194, guest, "Open with a sample log", open `/routines` | Error boundary shown; one "Maximum update depth exceeded" console error |
| Sign-in can erase the local log | Real store: `completeOnboarding({ loadDemo: false })` → `cloudGymFromState` as the remote vault; then `loadDemo()` locally; then the exact `sync.tsx` branch `if (vaultHasLog(remote)) replaceFromCloud(remote)` | `vaultHasLog(remote) = true` with 0 workouts; local completed sessions **137 → 0** |
| Era detection finds 2 eras; one rename orphans sessions | `buildChronicle` on the demo log | `Foundation 36 · The Return 101`; after renaming one era, **101/137** sessions in an era |
| First session reports PRs | `detectPrsForWorkout(firstSession)` | 4 |
| Euro Strong CSV corrupts data | Lockd `buildStrongImport` on SP `strong-euro.csv` | weights `undefined`, reps 5 and **0**, date **2026-03-02** for `03.02.2026` |
| `askTheLab` unauthenticated | `src/lib/lab/ask.ts:38–40` | No `.middleware(...)`; a validator and handler only |

## 3. New findings from the addendum work

These came out of checking Appendix A and B against the code. They affect PR scope, so they're
listed before the assessment.

1. **Lockers are public by default.** `ensureProfile` (`src/lib/cloud/api.ts:47–52`) creates every
   new profile with `is_public = true` and a handle derived from the display name. On first sign-in a
   lifter gets a public `/u/<handle>` page showing records, streak, strength-to-bodyweight ratios and
   moments, without opting in. Shares (`/s/$id`) have **no unpublish** (`delete` exists nowhere). See
   Override A-1.
2. **No tour exists.** Onboarding is one screen (`onboarding.tsx`: units + sample log / empty). The
   spec's "first tour stop" has nowhere to go. See Override A-3.
3. **41 text elements sit below the spec's 11 px floor** (39 × `text-[10px]`, 2 × `text-[9px]`),
   and 57 more are `text-[11px]`. "Standard = zero visual diff" and "Micro never below 11 px" can't
   both hold in step A. See Override A-4.
4. **The one-rep rule is already in the shared function** (`oneRepMax.ts:29`, `wholeReps === 1`
   returns the load). But `estimateOneRepMax` **rounds to a whole unit** (`Math.round`). That's
   harmless in grams, but Lift Math works in the unit entered, where 100 kg × 5 would become 117 instead
   of 116.67. See Override A-5.
5. **Warm-up sets start no rest timer at all** (`store.ts:659` skips `setType === "warmup"`), so
   "separate warm-up and working timers" is new behaviour, not a split of an existing one.
6. **"Repeat last session" already exists** (Today → "Repeat last", `index.tsx:340`, one tap starts
   the clone and opens the workout). PR 9 keeps it, tests it, and adds it to the empty workout state
   and the command palette.
7. **No paywall or entitlement code exists anywhere** (grep for paywall / entitlement / subscription /
   premium / isPro: none). The principle-8 guard in PR 1 protects the future, not the present.

## 4. Win-feature assessment (Appendix B, all 11)

| # | Opportunity | In code today | Missing | Depends on | Size | Risks | Lands in |
|---|---|---|---|---|---|---|---|
| 1 | **Import-first Chronicle** | Strong CSV import (Lockd `csv.ts`, broken on Euro files); Chronicle is derived on read, so it already appears after any import. SP wizard with mapping, Resolve and fingerprints. Onboarding offers only "sample log" or "start empty" | Hevy importer; generic CSV (SP wizard's manual mapping with no preset); "Import your history" as the first onboarding path; a post-import landing on Chronicle | PR 5 storage (years of rows), PR 7 importers, **O2 era detection** (without it, a 5-year import gets 2–3 eras), I-12 first-exposure PRs (else every imported lift opens with a fake PR run) | M | Hevy format must come from a real export (A-2); large imports need batching (PR 5) | PR 7 (importers), Phase 3 item 3 |
| 2 | **Web receipt, no account** | Year receipt (`wrapped.ts`, `buildYearReceipt`), receipt component (`receipt.tsx`), guest store, `/s/$id` share rendering (server-backed) | A public route outside `GymGate` that imports on the device and renders a receipt; "Continue in Lock'd" hands the parsed batch to the guest store; a Playwright assertion that no request body contains file bytes | PR 5, PR 6 (precache), PR 7 | S–M | SSR: the route must make **no server-function calls** with data; a stray analytics or font request is fine, a POST is a failure | Phase 3 item 4 |
| 3 | **Explained progression** | Lockd `progression.ts`: actions, a `why` string, easier week, deload, personal cadence. SP `progression.ts`: windowed stall rule, grid-snapped next load, receipt + claim id. Plate maths `reachableTotals`. Swaps: `swapExercise` rewrites `exerciseId`, so each lift already keeps its own history | `why` doesn't cite session dates or ids; stall against all-time peak (I-20); deloads unbuildable; missed-session handling (no time-gap rule); swaps inside programs (`substitutionOf`) aren't surfaced; UI to open the cited sessions | PR 3 characterisation, PR 4 domain, PR 8 merge | L | Test diffs will be large; every case needs a fixture | **Engine half in PR 8** (I-20); cases + UI in Phase 3 item 5 (A-6) |
| 4 | **Numbers show their working** | `bestOneRepMax` returns the source set; SP evidence catalog, `ClaimEvidenceSheet`, `VerdictEvidenceSheet`, per-set muscle evidence, stall comparison with session counts | A shared "provenance" shape (formula, inputs, sets used, sets excluded + reason) produced by e1RM, volume, PR, verdict, trend and progression; one sheet component; tap targets on every number | PR 4 (evidence catalog, SP volume/records), PR 8 | M | "Stated confidence" must be counts ("3 sessions vs the prior 3"), never a probability we can't justify | PR 8 |
| 5 | **History never paywalled** | Nothing gates anything; no entitlement code | The written promise (README + "Our promise" line in Settings); a guard so no route or module for history, charts or export can depend on an entitlement check | — | S | A guard that's too loose is theatre; make it structural (below) | PR 1; API/MCP in Phase 4 |
| 6 | **In-set speed parity** | Timestamp rest timer with MediaSession + wake lock; Repeat last (one tap); prefill; Enter completes | Warm-up rest timer (warm-ups start none today); precedence fix I-21 (routine/user rest currently overridden); typed-values fixes I-27/I-28; lock-screen timer (native) | PR 9 | M (web part) | Changing rest behaviour mid-habit: announce it once | **PR 9** (web); Phase 4 (lock screen) |
| 7 | **Watch companion** | Nothing | Everything; native project | Capacitor project (Phase 4) | L | Separate codebase to maintain | Phase 4 design doc |
| 8 | **Comeback mode** | Chronicle `layoff` + `comeback` events (gap ≥ 14 days); Lockd verdict `welcome_back`; year receipt `comeback` date | Re-entry load per lift from the last pre-layoff working set; "PRs since comeback"; a stated, editable rule | I-20 (stall vs all-time peak makes every comeback look like a stall today), O2 | S–M | The rule is a product judgement, not a prediction: say so in the UI (A-7) | Phase 3 item 6 |
| 9 | **Shareable receipts** | `/s/$id` publish for moments, receipts, wrapped, programs; `/u/$handle` locker; share cards (posters) | **Private by default** (lockers are public by default today); unpublish/revoke; a read-only coach/partner link (unguessable, revocable, scoped to history, no locker) | PR 2 (privacy default, A-1), PR 10 (poster identity) | S–M | Existing public lockers: changing the default must not silently hide someone who chose public (A-1) | PR 2 (privacy); Phase 3 item 7 |
| 10 | **Health context** | Manual bodyweight and girths (`body.tsx`) | Apple Health / Health Connect read; overlays in Chronicle; no score | Capacitor | M | Native permissions; never a readiness score | Phase 4 design doc |
| 11 | **Program from text** | `lockd-program` v1 JSON import/export; program packs | Deterministic text parser, preview, confirm, list of unparsed lines | Resolve-exercise matcher from PR 7 | M–H | Silent guesses: every unparsed line shown | Phase 4 design doc |

**Already partly built and undocumented:** Chronicle layoffs, comebacks and PR runs (#1, #8), the
Progression Engine's `why` and easier week (#3), moment posters, year receipts, wrapped, public shares
and the locker (#2, #9), Repeat last (#6), MediaSession rest timer (#6), and Lockd's own Weekly Verdict
`welcome_back` state (#8).

## 5. Where the pulled-forward items land

| Item | PR | Scope added to that PR |
|---|---|---|
| History never paywalled (principle 8, #5) | **PR 1** | `README.md` promise: "Your full history, charts and export are free, forever. If we ever charge, it will only be for things that cost money to run: sync, video storage, Lab compute." Settings line "Our promise" with the same text. Guard: (a) an ESLint `no-restricted-imports` rule that forbids any module matching `entitlement\|billing\|paywall\|subscription\|plan-gate` from the history, chart and export surfaces (`routes/history*`, `routes/chronicle`, `routes/analytics`, `routes/library.$id`, `routes/wrapped`, `lib/gym/*`, `lib/gym/csv`, backup/export actions); (b) a Vitest test that walks those modules' import graphs and fails on the same pattern, so the rule can't be disabled inline without a test failing |
| `askTheLab` fix (I-4) | **PR 2** (first commit) | Repo is public: land it first. Guests get the deterministic Lab; the LLM path requires sign-in and a per-user daily cap. No keys, URLs of deployments or secrets in code, tests, fixtures or PR text |
| Hevy + generic CSV importers (#1) | **PR 7** | Both through SP's mapping → Resolve → fingerprint flow. Generic CSV = the wizard with no preset and a manual column map. Hevy preset **only from a real export** (A-2) |
| Provenance (#4) | **PR 8** | Shared provenance shape + one sheet; e1RM, volume, PR, verdict and trend numbers become tappable |
| Separate warm-up and working rest timers, one-tap repeat last session, typed values win (#6) | **PR 9** | Warm-up rest setting (A-8), **I-21 precedence moves here** from the honesty list (routine rest > user default; learned rest as a labelled suggestion), I-27/I-28 input fixes, Repeat last tested and added to the empty workout state and the palette. Timer stays timestamp-based |
| Device-local text size key | **PR 5** | Reserve `device.textSize` in a device-only table that is **not** part of `settings`, so `cloudGymFromState` never carries it; included in the JSON backup, restored only when present (Appendix A fix 4) |
| Lift Math one-rep rule | **PR 4** | Split `estimateOneRepMax` into an unrounded core and the current rounded wrapper (A-5); add the 1–12 rep parity test now so it can't regress before Lift Math exists |

## 6. Proposed Phase 3 order

Gate unchanged: Phase 2 done, CI green, migration proven, offline cold start passing, a phone-width
regression pass fixed or logged.

| # | Item | Change from the brief | Why |
|---|---|---|---|
| 1 | Text size, step A | Keeps legacy micro sizes (A-4) | Zero diff must be provable |
| 2 | Lift Math, step A | — | Domain only; the parity test already exists from PR 4 |
| 3 | Import-first Chronicle | Requires O2 and I-12 merged first | Otherwise a big import shows two eras and fake PR runs |
| 4 | Web receipt, no account | — | Reuses item 3's import path |
| 5 | Explained progression | Engine merge already done in PR 8; this item is the case fixtures (missed sessions, failed reps, swaps, deload) and the cited-session UI (A-6) | Avoids doing I-20 twice |
| 6 | Comeback mode | — | Needs item 5's stall rule |
| 7 | Shareable receipts | Privacy default and unpublish already done in PR 2 (A-1); this item is the share card and the coach/partner link | Privacy can't wait for Phase 3 |
| 8 | Lift Math, step B | — | |
| 9 | Text size, step B | Raises the 9–10 px elements to the 11 px floor here | A-4 |
| 10 | Lab, cited | Deterministic Lab already ported in PR 8; this is the audit | — |

## 7. Overrides

| ID | Doc says | I propose | Why | Cost | Could break |
|---|---|---|---|---|---|
| **A-1** | Brief: privacy audit in Phase 3 item 7 | **New profiles private by default, and share unpublish, in PR 2.** Existing profiles keep their stored value, but the locker page shows the owner a one-time "Your locker is public — keep it public / make private" prompt | Public-by-default exposure of personal training data is a live problem wherever the app is deployed with sign-in; the repo is public too | Small PR 2 growth | Anyone relying on the auto-created public locker must opt in once |
| **A-2** | Brief: add a Hevy importer in PR 7 | Build the generic CSV path in PR 7 regardless; add the **Hevy preset only after you supply a real Hevy export** (any size; I'll anonymise it into fixtures). If none arrives by PR 7, the Hevy preset moves to its own PR | "Don't guess Hevy's columns" | Hevy may slip one PR | — |
| **A-3** | Appendix A: size control on "the first tour stop" | Put it on the onboarding screen (beside units) plus Settings and the command palette; **don't build a tour** | There is no tour; building one is a new feature | — | — |
| **A-4** | Appendix A: Standard = zero visual diff; Micro never below 11 px | Step A adds a `micro-legacy` role mapped to today's 9/10 px so Standard is pixel-identical; step B (the default flip) raises those 41 elements to 11 px | Both rules can't hold in one step | One extra role that step B deletes | — |
| **A-5** | Appendix A fix 1: one-rep rule in the shared `oneRepMax` | Already there. Additionally split an unrounded core (`e1rmExact(load, reps, formula)`) from the rounding wrapper; analytics keep grams-rounding, Lift Math rounds in the entered unit; parity test compares at gram precision | The current function rounds to a whole unit, which is wrong for kg/lb inputs | — | None; wrapper output unchanged |
| **A-6** | Appendix B #3 lands in Phase 3 item 5 | Engine half (stall rule, grid snap, plate-aware, cited sessions in `why`) lands in PR 8 as I-20; Phase 3 item 5 is the remaining cases + UI | I-20 already requires those changes; doing them twice wastes a cycle | — | — |
| **A-7** | Brief: propose the comeback re-entry rule | Default rule, labelled "Rule, not a prediction" and editable in Settings: from the **last pre-layoff working set** of each lift (cited by date), layoff 14–27 days → 90 %, 28–55 → 80 %, 56+ → 70 %, reps at the bottom of the prescribed range, snapped down to a buildable load. Recorded in the evidence catalog as `implementation_heuristic` with no research claim | Simple, stated, editable, cites its session | — | Users may read it as advice; the label says what it is |
| **A-8** | Appendix B #6: separate warm-up and working timers | Warm-up rest is a separate setting, **default off** (today's behaviour), with a suggested value the lifter sets once | Turning a timer on for every warm-up is a behaviour change nobody asked for; off-by-default keeps principle 1 | — | — |

## 8. New decisions

| # | Decision | Recommendation |
|---|---|---|
| DA-1 | Approve A-1 (privacy default + unpublish in PR 2; one-time prompt for existing public lockers) | Yes |
| DA-2 | Supply a real Hevy CSV export for fixtures (A-2) | Needed before PR 7 |
| DA-3 | Comeback rule numbers (A-7) | 90 / 80 / 70 % by layoff band, editable |
| DA-4 | Warm-up timer default (A-8) | Off |
| DA-5 | Approve A-3 to A-6 | Yes |
