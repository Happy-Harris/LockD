#!/usr/bin/env node
/**
 * Builds `/sw.js` into the static output after `vite build`. The worker is bundled from
 * `src/sw/worker.ts` with the list of files to cache and a build id filled in.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "vite";
import { buildIdOf, collectPrecache } from "./sw-manifest.mjs";

const root = resolve(import.meta.dirname, "..");
const staticDir = join(root, ".vercel/output/static");

if (!existsSync(staticDir)) {
  console.error(`[sw] ${staticDir} not found. Run vite build first.`);
  process.exit(1);
}

const precache = collectPrecache(staticDir);
const id = buildIdOf(staticDir, precache);

await build({
  root,
  configFile: false,
  logLevel: "warn",
  publicDir: false,
  define: { __PRECACHE__: JSON.stringify(precache), __BUILD_ID__: JSON.stringify(id) },
  build: {
    outDir: staticDir,
    emptyOutDir: false,
    target: "es2020",
    minify: false,
    sourcemap: false,
    lib: {
      entry: join(root, "src/sw/worker.ts"),
      formats: ["iife"],
      name: "lockdServiceWorker",
      fileName: () => "sw.js",
    },
  },
});

console.log(`[sw] sw.js written: ${precache.length} files, build ${id}`);
