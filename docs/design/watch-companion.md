# Watch companion (Opp 7)

Status: owner's seven answers recorded (2026-09-30). The TypeScript side, the SwiftUI watch app and the phone-side `LockdWatch` plugin are written and compiled in CI (unsigned, simulator). Nothing has run on a watch.

## Goal

The plan row (`docs/consolidation/PLAN-ADDENDUM.md` § 4, row 7): "Watch companion". What exists: "Nothing".
What it needs: "Everything; native project". Depends on: "Capacitor project (Phase 4)". Risk: "Separate
codebase to maintain". `docs/STATUS.md` § 4 row 7: "Watch companion (native SwiftUI, then Wear OS)", state
"design doc only". `docs/VISION.md` item 51: "complete set, view next target, timer controls, current
exercise. Phone stays on the bench."

In plain terms: during a workout, the lifter can see the current exercise and set, complete a set with one
tap, and see and adjust the rest timer on the wrist. Apple Watch first (SwiftUI), then Wear OS.

## What exists today

- **No native project.** There is no Capacitor config, no `ios/` or `android/` folder and no Capacitor or
  watch package in `package.json`. Nothing in `src/` talks to a watch.
- **The workout loop the watch would mirror** is all in `src/lib/gym/store.ts`: `addSet`, `updateSet`,
  `completeSet`, `uncompleteSet`, `finishWorkout`, `discardWorkout`, and the rest timer actions
  `startRestTimer`, `adjustRestTimer`, `stopRestTimer`. `completeSet` stamps `completedAt`, starts rest via
  `restSecondsAfter` (`src/lib/gym/rest.ts`) and returns the records it detected.
- **Set values** are canonical integers on `WorkoutSet` (`src/domain/types.ts`): `weightG`, `reps`, `rpe`,
  `rir`, `durationSeconds`, `distanceM`, plus `setType` and `completedAt`. Workout exercises carry the
  name snapshot (`exerciseNameSnapshot`) and `restSeconds`.
- **Previous values inline** come from `previousSetsForExercise` (`src/lib/gym/analytics.ts`) and
  `priorForSlot` (`src/lib/gym/pairs.ts`), used when a workout is built in the store
  (`previousWeightG`, `previousReps`).
- **Next target** is `ProgressionCall` in `src/lib/gym/progression.ts` (`suggestedWeightG`,
  `suggestedReps`, `suggestedSets`, `why`, `cites`), produced on read by `progressBoard`.
- **The rest timer** is timestamp-based (`TimerState.startedAt` / `endsAt`); see `lock-screen-rest-timer.md`.
- **Units** go through `@/domain/units` (`formatWeight`, `weightUnitFor`).

## Design

1. **The phone owns the log.** The watch holds no log and runs no engine. It shows a small snapshot the
   phone sends, and sends back intents. The phone applies every intent through the existing store actions,
   so every rule (superset rest, warm-up rest, record detection) runs in one place.
2. **Snapshot (phone to watch).** Sent when the active workout or the rest timer changes:
   workout id; current exercise name snapshot; the current set's id, order, set type, planned or typed
   `weightG` and `reps`, and the previous values for that slot; the next target line if a
   `ProgressionCall` exists for the exercise; the display unit; and the rest timer's `endsAt`, `isRunning`
   and `label`. Weights are sent as grams plus the unit, and formatted on the watch with the same rounding
   rules as `formatWeight` (the rule is documented, not re-invented).
3. **Intents (watch to phone).** `completeSet(setId)`, `adjustSetValue(setId, field, value)` for weight and
   reps only, `adjustRest(deltaSeconds)`, `stopRest()`, `nextExercise()`. Each carries the set id it was
   shown, so a stale tap cannot land on the wrong set; a mismatch is dropped and the watch refreshes.
4. **Screens.** One primary screen: exercise, set number, weight and reps in large type, previous values
   under them, one big Complete button. Completing starts rest, and the screen flips to the countdown drawn
   from `endsAt`. The crown (or rotary input on Wear OS) adjusts the focused number. A second screen shows
   the next target and its one-line `why`.
5. **Transport.** iOS: a native SwiftUI watch app, with a small native module on the phone side that the
   React app calls through a Capacitor plugin interface (web implementation is a no-op). Wear OS later uses
   the same TypeScript interface with its own native module.
6. **Phone not reachable.** The watch shows "Phone not reachable" and disables Complete rather than logging
   on its own. A queued offline mode is an open question, because it creates a second writer.
7. **Records.** When `completeSet` returns records, the phone may send a short "New record" line. It names
   the lift and value only; the receipt stays on the phone.

## Data and storage

- No new stored field is needed. The snapshot is derived on send and never persisted.
- All values cross the bridge as integers: grams, seconds, metres; RPE and RIR as the store holds them.
- If the owner wants to record which device completed a set, that is an optional `WorkoutSet` field added
  in `src/domain/types.ts`, `src/lib/backup/schema.ts` and export/import, with an old-format fixture and a
  round-trip test. The default in this design is not to add it.

## Principles check

- **Logging speed:** one tap on the watch completes a set and starts rest, as on the phone. The watch adds
  no required step to the phone flow. The timed logging e2e (`e2e/logging-speed.spec.ts`) is unaffected.
- **History as the source of truth:** the watch never stores or derives history; the phone's store does.
- **Number honesty:** the watch shows the same numbers the phone shows, from the same engines. A target
  with no `ProgressionCall` shows nothing, not a guess.
- **Guest and offline:** phone to watch is local; no account, no network.
- **One codebase:** the watch app is a separate native codebase by necessity (the plan's stated risk). It
  is kept thin: a renderer and an intent sender, with no lifting maths of its own.
- **Brand:** "Lock'd" on the watch app name and complications.

## Owner's answers (questions 19 to 25 of the approved list, 2026-09-30)

All taken as recommended.

| # | Question | Answer |
|---|---|---|
| 1 | Scope of version 1 | Complete set and rest only. No editing weight or reps on the wrist, so `adjustSetValue` and `nextExercise` are not in the protocol |
| 2 | Log without the phone | No. The watch shows "Phone not reachable" and disables Complete. One writer, no merge |
| 3 | Start a workout from the watch | No. It follows a workout started on the phone |
| 4 | Complications | None in version 1 |
| 5 | Haptic at end of rest | Follows the phone's "Vibrate when rest ends" (`vibrate` in the snapshot) |
| 6 | Heart rate | Out of scope |
| 7 | Wear OS | After the Apple Watch app has been in use for a while |

## Built (TypeScript, tested)

- `src/lib/native/watch.ts`: the protocol (version 1), `buildWatchSnapshot` (pure; the first set not done, warm-ups count, a left and right
  pair is one set with each side matched to its prior side, previous values only when a previous session exists, a next target only when the
  progression engine made one), `parseWatchIntent` (the watch is not trusted to be well formed), `applyWatchIntent` and `createWatchSync`.
- Intents: `completeSet(setId)`, `adjustRest(deltaSeconds)` (a non-zero whole number, at most 60), `stopRest`. The phone applies each through the
  store's own actions. A complete-set tap carries the set the watch was shown; if that is no longer the current set it is dropped and the phone
  sends the watch a fresh snapshot, so a stale tap cannot log the wrong set.
- Sync sends only when something the watch shows changed. The countdown is drawn on the watch from `endsAt`, so ticking seconds are not a change.
  Every bridge failure is swallowed; the watch can never get in the way of logging.
- `src/components/app/watch-sync.tsx`, mounted in the shell, native iOS only: builds the snapshot from the store and the same ghost and
  progression calls the workout screen uses, and sends a short "Bench Press 102.5 kg" line for eight seconds after a record (lift and value only).
- Tests: `src/lib/native/watch.test.ts`.

## Native half (written, compiled in CI)

- `ios/App/LockdWatch/`: a watchOS 9 SwiftUI app (`com.happyharris.lockd.watchkitapp`). It holds no log. `WatchModel` receives the phone's snapshot over WatchConnectivity and sends intents back; `ContentView` shows the exercise, the set, previous values, the next target and the rest countdown (drawn from `endsAt`), with one big button for "complete set" and +15 / -15 / stop for rest.
- The phone writes the wording. The snapshot carries `display` text (`load`, `previous`, `target`) built with `formatWeight`, so the watch never formats a weight.
- `ios/App/App/Native/LockdWatchPlugin.swift`: the phone-side Capacitor plugin. `updateApplicationContext` for the latest snapshot, `sendMessage` for the short record line, and incoming watch messages forwarded to the web layer as intents.
- `scripts/native/add-watch-app.rb` adds the target and the "Embed Watch Content" phase to the project.
- CI (`native-build.yml`) builds the app with the watch target for the simulator, unsigned, and fails if the watch app or the Live Activity extension is missing from the build products.

## Checks

| Check | Status |
|---|---|
| Code written | yes |
| Compile check | CI job `ios` (simulator, unsigned) |
| Device check | **Not run.** Reachability, tap latency, whether the snapshot survives the watch app being suspended, and whether a tap is applied with the phone locked |

### Taps while the phone's web layer is suspended (code fix)

A tap used to be dropped if the phone's web layer was not running. Now the phone's native side (`WatchRelay`, started from the app
delegate so a background launch still catches it) writes each tap to a durable inbox with the id the watch gave it and the time it was
tapped. The web store stays the only writer: when the page runs it applies each tap as of when it was made, then acknowledges it
(`src/lib/native/pending-intents.ts`, shared with the lock-screen timer). The watch never shows a tap as done on its own:

- After a tap the button reads "Waiting for phone" and cannot be tapped again; a rest control is disabled while one is waiting.
- The phone's next snapshot carries `acks`: `applied`, or `dropped` with a reason. Only then does the waiting end. A dropped tap says so
  ("Not logged: that set had already moved on", and similar). After 15 s with no answer the screen says nothing is logged until the
  phone confirms; after 10 minutes it stops waiting and says the phone has not confirmed.
- If the live message fails, the same tap is sent again as a queued transfer. The phone applies a tap with a given id once.
- A tap older than six hours is not applied. A stale set tap and a rest tap from before the current timer are dropped, as before.

Needs a device: whether the phone's web layer gets time to run when a tap wakes the app in the background (if not, the tap waits in the
inbox and is applied when the app is next opened, and the watch keeps saying it is waiting), and how long the whole round trip takes.

The watch app now has its icon catalog (the Lock'd mark; `scripts/make-icons.mjs`).

## Needs the owner

- An Apple Developer account and team, and App IDs for the watch app (`com.happyharris.lockd.watchkitapp`) and the widget extension.
- A paired watch (or the simulator pair) for the device check. Wear OS is not started.

## Out of scope

- The native watch app itself (see "Not written").
- A standalone watch app with its own log, sync or account.
- Workout history, Chronicle, Lab or charts on the watch.
- Readiness or recovery scores of any kind.
