// Builds the app as a static single-page bundle for the Capacitor shell (`capacitor.config.ts`, webDir dist/client).
// TanStack Start's SPA mode writes the app shell as `_shell.html`; Capacitor loads `index.html`.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const build = spawnSync("npx", ["vite", "build", "--mode", "native"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, LOCKD_NATIVE: "1" },
});
if (build.status !== 0) process.exit(build.status ?? 1);

const dir = join(process.cwd(), "dist", "client");
const shell = join(dir, "_shell.html");
if (!existsSync(shell)) {
  console.error("[build-native] dist/client/_shell.html was not written; the SPA build did not run.");
  process.exit(1);
}
copyFileSync(shell, join(dir, "index.html"));
console.log("[build-native] dist/client/index.html written. Next: npx cap add ios (or android), then npx cap sync.");
