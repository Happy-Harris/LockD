# Native shell: Capacitor (Phase 4 foundation)

Status: **foundation built** (2026-09-30): the config, a static single-page build, the platform check and the committed `ios/` and
`android/` projects. Nothing here has run on a device. The three Phase 4 features depend on it: the lock-screen timer
(`lock-screen-rest-timer.md`), health context (`health-context.md`) and the watch companion (`watch-companion.md`).

## Native build status

Three separate things are kept apart: code written, a compile check, and a device check. A green CI job is a compile check only.

| Item | Code written | Compile check | Device check | Needs the owner |
|---|---|---|---|---|
| Lock-screen rest timer, Android | yes | built and unit tested here; also in CI job `android` | not run; the lateness test is outstanding | nothing for a debug build; a Play Console account and a signing key for release |
| Lock-screen rest timer, iOS (Live Activity) | yes | CI job `ios` only (no Xcode here) | not run | an Apple Developer account and team for signing; the widget extension needs its own App ID (`com.happyharris.lockd.RestTimerWidget`) |
| Health reads, Android (Health Connect) | yes | built and unit tested here; also in CI job `android` | not run | nothing for a debug build; a Play Console account and Google's Health Connect declaration for release |
| Health reads, iOS (HealthKit) | yes | CI job `ios` only | not run | an Apple Developer account and the HealthKit capability on the App ID |

CI: `.github/workflows/native-build.yml` builds the debug APK and runs the Android unit tests on Ubuntu, and builds the iOS app and widget extension
unsigned for the simulator on macOS. It runs on changes under `ios/`, `android/`, `src/lib/native/`, the Capacitor config and the native scripts.
It signs nothing and proves nothing about a real device.

## What ships

- `@capacitor/core` (runtime), `@capacitor/cli` (dev), and the official `@capacitor/local-notifications` plugin.
- `capacitor.config.ts`: `appName` "Lock'd", `webDir` `dist/client`, and `appId` `com.happyharris.lockd`.
- `npm run build:native` (`scripts/build-native.mjs`): builds the same React app as a static single-page bundle with
  TanStack Start's SPA mode (`vite build --mode native`, see `vite.config.ts`) and copies the shell page to `index.html`.
  The normal web build (`npm run build`) is unchanged; nothing in the default mode reads the new option.
- `src/lib/native/platform.ts`: `platform()` and `isNativePlatform()`. On the web and in tests they say "web", which is
  what makes every native bridge a no-op there.

## What was checked here

- The native build completes and writes `dist/client/index.html` plus the assets.
- That bundle, served as plain static files with a fallback to `index.html`, opens the app in Chromium: onboarding, the
  sample log and Today work with no server. Guest use needs no server, which is what principle 5 asks of a native build.

## What was not checked, and why

- No device or simulator build: this environment has no Xcode, Android SDK or signing. `ios/` and `android/` are
  generated and committed but have never been built.
- Sign-in, sync, public shares and the Lab call server functions at relative URLs, which do not exist inside a static
  bundle. The owner chose guest and offline first (answer 2); nothing hides them yet.
- The service worker and the install manifest were not exercised inside a native web view.

## Steps for the owner

1. Native builds run in cloud CI (GitHub Actions macOS runner or Codemagic): `npm ci`, `npm run build:native`, `npx cap sync`, then the platform build.
2. Store setup, signing and an Apple Developer account are the owner's; none is in the repo.

## Owner's answers

Recorded 2026-09-30.

1. **Bundle identifier: `com.happyharris.lockd`, the same on iOS and Android.** No Apple account is needed to pick it. Users never see it. It is fixed once the app ships, so a later rebrand does not matter.
2. **Cloud features (sign-in, sync, Lab, shares) in the first native build: guest and offline first.** Nothing is hidden yet; the static bundle has no server functions to call.
3. **`ios/` and `android/` are committed now.** The owner works from a phone, so every native build runs in cloud CI (a GitHub Actions macOS runner or Codemagic), and CI needs the folders in the repo. The lock-screen timer's entitlements and Info.plist edits also live there.

`ios/` and `android/` were generated with `npx cap add`. CocoaPods and Xcode are not available here, so `pod install` has not run and the iOS project has not been opened or built; the Android project has not been built either. Built web assets and Pods are ignored by the platform folders' own `.gitignore`.
