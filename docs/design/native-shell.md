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
  bundle. **Default taken (owner can reverse):** the first native build is a guest and offline app; the cloud features are
  a later step that needs an API origin supplied at build time (never committed). Until then the sign-in prompts should
  be hidden on native. That hiding is not built yet.
- The service worker and the install manifest were not exercised inside a native web view.

## Steps for the owner

1. On a Mac with Xcode: `npm ci`, `npm run build:native`, `npx cap add ios`, `npx cap sync`, `npx cap open ios`.
2. Choose the bundle identifier (`appId`) and team in Xcode. Changing `appId` before the first signed build costs nothing;
   after a store listing it is a migration.
3. Android is the same with `npx cap add android` and Android Studio.
4. Store setup, signing and an Apple Developer account are the owner's; none is in the repo.

## Defaults taken

| Question | Default | Reversal |
|---|---|---|
| Bundle identifier | `app.lockd.app` (placeholder) | Edit `capacitor.config.ts` before the first signed build |
| Cloud features in the first native build | Off; guest and offline only | Needs an API origin at build time |
| Generated `ios/` and `android/` folders | Not committed until they have been built on a device | Run `npx cap add` and commit |
| Other Capacitor plugins | Added by the feature that needs each one | n/a |
