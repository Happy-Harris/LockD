# Lock-screen rest timer (Opp 6, native half)

Status: **TypeScript and native code written** (2026-09-30). The Android code is compiled and unit tested; the iOS code is
compiled only by the macOS job in CI. Nothing has run on a device, and the Android lateness test below is **outstanding**.

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

## Owner's answers

Recorded 2026-09-30. The owner accepted the recommended answer on all seven.

| # | Question | Answer |
|---|---|---|
| 1 | Controls | Plus, minus and stop. No "complete next set" (it would write history from a lock screen) |
| 2 | Step | 15 s, the in-app and Media Session step (`LOCK_SCREEN_STEP_SECONDS`) |
| 3 | Media Session tile | Off in the native build (it would be a second tile); unchanged on the web |
| 4 | End alert settings | Follows the existing "Rest timer notification" setting; the sound and vibration settings still apply in the app |
| 5 | "Rest done" lifetime | 60 s, then it clears (`LOCK_SCREEN_DONE_LINGER_SECONDS`) |
| 6 | Android exact alarms | Do not ask for the permission. The alert is scheduled with `allowWhileIdle`. **Test condition:** measure it on a real Android device with the screen locked. If the alert is more than about 5 s late, come back to the owner with a foreground-service option instead of the permission |
| 7 | Home-screen widget | Later, not in this Opp |
| n/a | Stored native activity id | None stored; `show` must be safe to call again for a timer that is already showing |

**The Android lateness test has not been run and stays outstanding** until someone runs it on a real Android phone with the screen
locked (see "Verification" below). No result is recorded here until it has actually run.

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
- **The `LockScreenTimer` plugin.** Contract: `show(timer)`, `update(timer)`, `clear()` and an `action` event (`plus`, `minus`,
  `stop`); the payload is `LockScreenTimerPayload` (`startedAt`, `endsAt`, `endsAtMs`, `durationSeconds`, `isRunning`,
  `remainingSeconds`, `label`, `workoutId`). `endsAtMs` was added so native code needs no ISO parser.
  - **Android** (`android/app/src/main/java/com/happyharris/lockd/`, Java, not Kotlin, because the project has no Kotlin
    toolchain and the plugin is small): `LockScreenTimerPlugin` posts one ongoing notification on a low-importance "Rest timer"
    channel. A running timer uses the system chronometer counting down to `endsAtMs`; a paused one shows its remainder and a Stop
    button; a finished one says "Rest done" and times out after 60 s. Buttons are broadcast intents handled by
    `LockScreenActionReceiver`, which forwards them to the web layer. `RestTimerFormat` holds the wording and is unit tested
    (`RestTimerFormatTest`). `POST_NOTIFICATIONS` is declared; without the grant the tile is skipped and the scheduled alert, which asks
    for it, still works. The plugin is registered in `MainActivity`.
  - **iOS** (`ios/App/App/Native/`, `ios/App/RestTimerWidget/`): `LockScreenTimerPlugin` starts, updates and ends an ActivityKit Live
    Activity (iOS 16.2 and later; older systems get the scheduled alert only). A Widget Extension target `RestTimerWidgetExtension`
    (added by `scripts/native/add-rest-timer-widget.rb`) draws it: a `Text(timerInterval:)` clock bound to `endsAt`, so the system
    counts down with the app suspended, and minus, plus and stop buttons (iOS 17 and later, as `LiveActivityIntent`s that write to the
    durable inbox, see "Taps while the web layer is not running" below). `MainViewController` registers the plugin; the storyboard and `NSSupportsLiveActivities` are updated.
  - **Known limit, kept explicit:** a Live Activity does not redraw itself at zero while the app is suspended, so it may sit at 0:00
    until the app wakes; the scheduled notification is what alerts. This is the system's behaviour, not something code here can change,
    and it needs a device to see how it looks.
- **Taps while the web layer is not running (code fix).** A button tapped on a locked phone used to be dropped when nothing was
  listening. Now the tap is written to a durable native inbox (iOS: a file written atomically, filled by the Live Activity intent;
  Android: preferences, filled by the notification receiver) with its id and the time it was tapped. The web store stays the only
  writer: when the page runs it pulls the inbox, applies each tap as of when it was tapped, and only then acknowledges it
  (`src/lib/native/pending-intents.ts`). Until the store has changed, the tile keeps showing the old time: a button never shows a
  result the store has not written. A tap with no timer to act on, from before the current timer, or older than six hours is not
  applied. What still needs a device: whether iOS and Android give the page time to run while the phone stays locked. If not, the tap
  is applied the next time the app is opened (it is kept, not lost), and the tile does not change until then.
- **Verification.**
  - Compiled here: the Android app builds (`assembleDebug`) and its unit tests pass (the inbox's `PendingActionsTest` and the wording's `RestTimerFormatTest`). The TypeScript is covered by `lock-screen-timer.test.ts`.
  - Compiled in CI only: the iOS app and the widget extension (`.github/workflows/native-build.yml`, job `ios`, unsigned, simulator SDK). Not
    compiled here: there is no Xcode.
  - Not verified on a device: any of it. To check: the tile appears and counts down with the screen locked; the buttons change the
    timer, including a tap with the phone locked and the app suspended (and how soon the tile follows); the end alert arrives; the
    Live Activity appears on a real iPhone; how the Live Activity looks at zero.
  - **Android lateness test (outstanding):** on a real Android phone with the screen locked, finish a set, let the alert fire, and
    measure how late it is against `endsAt`. If it is more than about 5 s late, come back to the owner with a foreground-service option.

## Out of scope

- Changes to rest precedence, warm-up rest or learned rest (Step 9, decision D7 and A-8).
- The watch (see `watch-companion.md`).
- Background audio or music control.
