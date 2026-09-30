# Watch companion (Opp 7)

Status: design doc only (Phase 4). No native code, no new dependencies and no change to `src/` ship with it.

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

## Open questions for the owner

1. Scope of version 1: complete set and rest only, or also editing weight and reps on the wrist?
2. Should the watch ever log without the phone (queued, then merged), accepting a second writer?
3. Should the watch be able to start a workout (for example "Repeat last session"), or only follow one
   started on the phone?
4. Complications: which one, if any (rest remaining, sets done)?
5. Haptic at the end of rest on the watch: always, or following `restTimerVibrate`?
6. Heart rate from the watch: out of scope, or stored later as health context (see `health-context.md`)?
7. When is Wear OS worth starting: a date, or after the Apple Watch app has been used for a while?

## Out of scope

- Any native code, Capacitor setup or new package (this is a design doc).
- A standalone watch app with its own log, sync or account.
- Workout history, Chronicle, Lab or charts on the watch.
- Readiness or recovery scores of any kind.
