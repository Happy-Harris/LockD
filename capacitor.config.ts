import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native shell (Phase 4; `docs/design/native-shell.md`). The same React app, built as a static single-page
 * bundle (`npm run build:native`) and wrapped by Capacitor. Nothing here is a secret or a deployment URL.
 *
 * `appId` is the owner's choice (`com.happyharris.lockd`, same on iOS and Android); it cannot change once the app ships.
 */
const config: CapacitorConfig = {
  appId: "com.happyharris.lockd",
  appName: "Lock'd",
  webDir: "dist/client",
  ios: { contentInset: "always" },
};

export default config;
