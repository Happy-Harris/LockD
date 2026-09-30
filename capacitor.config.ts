import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native shell (Phase 4; `docs/design/native-shell.md`). The same React app, built as a static single-page
 * bundle (`npm run build:native`) and wrapped by Capacitor. Nothing here is a secret or a deployment URL.
 *
 * `appId` is a placeholder default: a bundle identifier is tied to the owner's Apple Developer and Google Play
 * accounts, so it is the owner's to change before the first signed build.
 */
const config: CapacitorConfig = {
  appId: "app.lockd.app",
  appName: "Lock'd",
  webDir: "dist/client",
  ios: { contentInset: "always" },
};

export default config;
