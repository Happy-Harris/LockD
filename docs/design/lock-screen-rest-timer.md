# Lock-screen rest timer (Opp 6, native half)

Status: **TypeScript side built with placeholder values** (2026-09-30), awaiting the owner's answers below; the native side is not
written and nothing has run on a device.

## Goal

The plan row (`docs/consolidation/PLAN-ADDENDUM.md` § 4, row 6) lists, under what Opp 6 still needs:
"lock-screen timer (native)", landing in "Phase 4 (lock screen)". `docs/STATUS.md` § 4 says: "Lock-screen
timer needs native code (Phase 4 doc)". `docs/VISION.md` item 50 describes it as a "native Capacitor build
shows remaining rest without reopening Lock'd".

In plain terms: when a set is completed and the phone is locked or Lock'd is in the background, the lifter
sees the remaining rest on the lock screen, and is alerted when it ends, without unlocking. The web half of
Opp 6 (warm-up and working rest, precedence, typed values) shipped in Step 9 and is not reopened here.

## What exists today

- **Timer state** is `TimerState` in `src/domain/types.ts`: `workoutId`, `setId`, `startedAt`, `endsAt`,
  `durationSeconds`, `isRunning`, `label`, `suggestedSeconds`. It is one nullable `restTimer` field in the
  store and is persisted (`src/lib/storage/persisted.ts` lists `restTimer`; `persisted.test.ts` checks a
  running timer survives a reload with its `endsAt` intact).
- **Starting it.** `completeSet` in `src/lib/gym/store.ts` stamps the set, then, when
  `settings.restTimerAutoStart` is on and the superset rules say rest now (`endsSuperset`, `pairIsDone`),
  asks `restSecondsAfter` in `src/lib/gym/rest.ts` for the seconds (routine rest, else the lifter's default;
  warm-ups only when `warmupRestSeconds` is set) and calls `startRestTimer`. A learned rest is attached as
  `suggestedSeconds` via `restSuggestion`, never applied.
- **Timestamp-based.** `startRestTimer` writes `startedAt` and `endsAt` from the wall clock.
  `adjustRestTimer` recomputes the remainder from `endsAt` and restarts. Nothing counts down in state.
- **Display and alerts** live in `RestTimerBar` in `src/components/app/rest-timer.tsx`. A 200 ms interval
  only refreshes `now`; the remaining time is always `Date.parse(endsAt) - now`. At zero it calls
  `chime` (Web Audio) and `alertRestDone` (vibration and a `Notification` only when the page is hidden),
  both gated by `restTimerSound`, `restTimerVibrate` and `restTimerNotification`. The code comment says
  these are best effort: "a phone that is locked or a tab that is throttled may delay it".
- **Today's lock-screen stand-in** is the Media Session API: the same component paints a canvas
  (`paintLockArt`) and sets `navigator.mediaSession.metadata`, with pause, play, seek forward and back
  (plus and minus 15 s) and stop handlers. It also holds a screen wake lock while the timer runs and puts
  the remaining time in `document.title`.
- **No native project exists.** There is no Capacitor config, no `ios/` or `android/` folder and no
  Capacitor package in `package.json`. `PLAN.md` § 4 only names a later SQLite adapter behind the
  `LockdRepository` port (`src/lib/storage/repository.ts`).

## Design

1. **One source of truth.** The web store stays the owner of the timer. Native code never keeps its own
   countdown; it receives `startedAt`, `endsAt`, `label` and the workout and set ids, and renders from them.
   The phone's system clock does the counting.
2. **A thin bridge.** A small platform module (a Capacitor plugin interface in TypeScript, with a no-op web
   implementation) exposes three calls: `show(timer)`, `update(timer)`, `clear()`. `RestTimerBar` already
   reacts to every change of `restTimer`; it calls the bridge next to the Media Session code. On the web the
   bridge does nothing and today's behaviour is unchanged.
3. **iOS.** A Live Activity (ActivityKit) with a timer text bound to `endsAt`, so the system draws the
   countdown without the app running. A local notification is scheduled for `endsAt` so the alert fires even
   if the app is suspended. Both are replaced on `update` and removed on `clear`.
4. **Android.** An ongoing notification using the platform chronometer counting down to `endsAt`, plus an
   exact alarm or scheduled notification for the end. Same three calls.
5. **Controls from the lock screen.** Plus 15 s, minus 15 s and stop, matching the Media Session handlers
   today. A tap on a control sends the action back to the store (`adjustRestTimer`, `stopRestTimer`); the
   store writes new timestamps and pushes `update`. The native side never edits the timer itself.
6. **Pause.** Today the Media Session pause handler sets `isRunning: false` and stores the remainder in
   `durationSeconds`. A paused timer shows a static remainder on the lock screen and no scheduled alert.
7. **Ending.** When `endsAt` passes, the lock screen shows "Rest done" and the label, and the scheduled
   alert fires once. When the workout finishes or is discarded, the store already clears `restTimer`
   (`finishWorkout` and `discardWorkout` in `src/lib/gym/store.ts`), and the bridge calls `clear()`.
8. **Media Session stays** for the web and installed PWA. In the native build it is either kept or turned
   off to avoid a second lock-screen tile (open question).

## Data and storage

- No new stored field is required. `TimerState` already carries ISO timestamps; the countdown is derived.
- Seconds stay integers (`durationSeconds`, `suggestedSeconds`), as today.
- If a native activity id must survive a reload, it lives in native storage, not in the store or backups.
  If the owner prefers it in the store, it is an optional field on `TimerState` travelling through
  `src/domain/types.ts`, `src/lib/backup/schema.ts` and export/import, with a round-trip test.

## Principles check

- **Logging speed:** nothing is added to the set flow. One tap still completes the set and starts rest;
  the native call runs after the store write and cannot block it.
- **History as the source of truth:** the timer is not history and is not written into sessions. Set
  timestamps stay in `completeSet`.
- **Number honesty:** the lock screen shows the same remaining time as the in-app bar because both read
  `endsAt`. A suggested rest is never applied silently on the lock screen either.
- **Guest and offline:** the Live Activity and notifications are local; no account and no network.
- **One codebase:** one React app; the native part is a thin renderer behind a plugin interface with a web
  no-op.
- **Brand:** "Lock'd" on the activity and notifications, as in `paintLockArt` today.

## Open questions for the owner

1. Which lock-screen controls: plus and minus, stop, and should "complete next set" ever be there?
2. The step size for plus and minus (the app uses 15 s today; keep it or make it a setting?).
3. Keep the Media Session tile in the native build, or show only the native one?
4. Should the native end-of-rest alert follow the existing sound, vibrate and notification settings, or
   have its own?
5. How long should a "Rest done" state stay on the lock screen before it clears itself?
6. Android exact alarms need a user permission on recent versions. Ask for it, or accept a possibly late
   alert and say so?
7. Is a home-screen widget in scope for this Opp, or later?

## Open questions: not decided, waiting for the owner

The seven questions above stand. The code below uses placeholder values so it runs and can be tested; none is a decision,
and each changes when the owner answers. Recommended answers are in the thread.

| # | Question | Placeholder in the code |
|---|---|---|
| 1 | Controls | plus, minus, stop |
| 2 | Step | 15 s (`LOCK_SCREEN_STEP_SECONDS`) |
| 3 | Media Session tile in the native build | off in native, unchanged on the web |
| 4 | End alert settings | follows "Rest timer notification" |
| 5 | "Rest done" lifetime | 60 s (`LOCK_SCREEN_DONE_LINGER_SECONDS`) |
| 6 | Android exact alarms | not requested |
| 7 | Home-screen widget | none |

Built:

- `src/lib/native/lock-screen-timer.ts`. `createLockScreenSync(bridge)` mirrors the store's `restTimer` to the phone and
  only talks to it when something it shows has changed (a new end time, pause, label, or the rest ending). It shows
  "done" at the end, clears after the linger, and clears at once when the timer goes (stop, finish or discard the
  workout). A failed native call is dropped so it can never get in the way of logging.
- `src/components/app/rest-timer.tsx` calls it only on native, and turns the Media Session tile off there. The plus, minus
  and stop buttons on the phone come back as `action` events and go through `adjustRestTimer` and `stopRestTimer`, so the
  store stays the only owner of the timer and writes the new timestamps.
- **End-of-rest alert** uses the official `@capacitor/local-notifications` plugin (`schedule` with a fixed id, so a new
  timer replaces the old alert). It asks for notification permission the first time it needs it.
- **The `LockScreenTimer` plugin** is registered with a no-op web implementation. Its native half (an iOS Live Activity
  through ActivityKit, an Android ongoing notification with a chronometer) is **not written**. Its contract:
  `show(timer)`, `update(timer)`, `clear()` and an `action` event (`plus`, `minus`, `stop`); the payload is
  `LockScreenTimerPayload` (`startedAt`, `endsAt`, `durationSeconds`, `isRunning`, `remainingSeconds`, `label`). Until it
  exists, native calls fail quietly and only the scheduled end alert works.
- **Not verified:** everything native. Tests use a fake bridge (`src/lib/native/lock-screen-timer.test.ts`).

## Out of scope

- The native Live Activity and ongoing-notification code (to be written on a Mac and Android Studio; see above).
- Changes to rest precedence, warm-up rest or learned rest (Step 9, decision D7 and A-8).
- The watch (see `watch-companion.md`).
- Background audio or music control.
