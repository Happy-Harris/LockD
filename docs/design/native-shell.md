# Native shell: Capacitor (Phase 4 foundation)

Status: **foundation built** (2026-09-30): the config, a static single-page build and the platform check. No iOS or Android
project is committed and nothing here has run on a device. The three Phase 4 features depend on it: the lock-screen timer
(`lock-screen-rest-timer.md`), health context (`health-context.md`) and the watch companion (`watch-companion.md`).

## What ships

- `@capacitor/core` (runtime) and `@capacitor/cli` (dev). No other Capacitor plugin yet.
- `capacitor.config.ts`: `appName` "Lock'd", `webDir` `dist/client`, and a placeholder `appId` (`app.lockd.app`).
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

- No device or simulator build: this environment has no Xcode, Android SDK or signing. `npx cap add ios` and
  `npx cap add android` were not run, so no `ios/` or `android/` folder is committed. Generating them is the owner's
  first step on a Mac (below).
- Sign-in, sync, public shares and the Lab call server functions at relative URLs, which do not exist inside a static
  bundle. Whether the first native build leaves them out is open question 2; nothing hides them yet.
- The service worker and the install manifest were not exercised inside a native web view.

## Steps for the owner

1. On a Mac with Xcode: `npm ci`, `npm run build:native`, `npx cap add ios`, `npx cap sync`, `npx cap open ios`.
2. Choose the bundle identifier (`appId`) and team in Xcode. Changing `appId` before the first signed build costs nothing;
   after a store listing it is a migration.
3. Android is the same with `npx cap add android` and Android Studio.
4. Store setup, signing and an Apple Developer account are the owner's; none is in the repo.

## Open questions for the owner

These are not decided. The values in the repo (`appId` `app.lockd.app`, no `ios/` or `android/` folder) are placeholders
so the build runs; none is a decision.

1. The bundle identifier (`appId`). Recommended: choose it when the Apple Developer account exists; until then the placeholder stays.
2. Cloud features (sign-in, sync, Lab, shares) in the first native build. Recommended: guest and offline first.
3. Commit the generated `ios/` and `android/` folders, or generate them on each machine. Recommended: commit them once a device build works.
