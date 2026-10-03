import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { isMigrationFile } from "./scripts/migration-plan.mjs";
import { SECURITY_HEADERS } from "./src/lib/security/headers.ts";

function copyPgliteAssetsPlugin(): Plugin {
  return {
    name: "app-builder:copy-pglite-assets",
    apply: "build",
    closeBundle: {
      sequential: true,
      order: "post",
      handler() {
        const dest = join(process.cwd(), ".vercel/output/functions/__server.func/_libs");
        const src = join(process.cwd(), "node_modules/@electric-sql/pglite/dist");
        if (!existsSync(dest) || !existsSync(src)) return;
        for (const file of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
          const from = join(src, file);
          if (existsSync(from)) copyFileSync(from, join(dest, file));
        }
      },
    },
  };
}

/** The files `src/lib/db.ts` globs — same directory, same non-recursive scope. */
function hasGlobbedMigrations(root: string): boolean {
  try {
    return readdirSync(join(root, "migrations")).some(isMigrationFile);
  } catch {
    return false;
  }
}

/**
 * Finish PGLite bootstrap during dev-server setup (before traffic). Vite awaits
 * async `configureServer` hooks. Production: `src/lib/db` kicks `ensureDbReady`
 * on import.
 *
 * Vite awaiting the hook puts this on time-to-first-render, so an app with no
 * migrations — no schema to apply — skips it entirely rather than paying for a
 * PGLite instance it never queries.
 */
function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "app-builder:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      if (!hasGlobbedMigrations(server.config.root)) return;
      try {
        const mod = (await server.ssrLoadModule("/src/lib/db.ts")) as {
          ensureDbReady?: () => Promise<void>;
        };
        if (typeof mod.ensureDbReady === "function") {
          await mod.ensureDbReady();
        }
      } catch (err) {
        console.error("[app-builder] DB bootstrap failed:", err);
        throw err;
      }
    },
  };
}

// `0.0.0.0:8080` is the dev-server host and port the e2e config expects; keep them in step.
export default defineConfig(({ command, isPreview, mode: requestedMode }) => {
  // The SPA prerender starts a preview server that reads this file again in the default mode, so `build:native` also
  // sets LOCKD_NATIVE. Without it the preview asks for a server build that the native build does not make.
  const mode = process.env.LOCKD_NATIVE === "1" ? "native" : requestedMode;
  return {
    server: {
      host: "0.0.0.0",
      port: 8080,
      strictPort: true,
    },
    preview: {
      host: "127.0.0.1",
      port: 8081,
      strictPort: true,
    },
    resolve: { tsconfigPaths: true },
    // Pre-bundle dependencies that only lazily loaded routes import, so the dev server never
    // re-optimises and hard-reloads mid-session (it breaks e2e runs on a cold CI start).
    optimizeDeps: { include: ["@radix-ui/react-alert-dialog", "dexie"] },
    plugins: [
      pgliteBootstrapPlugin(),
      tailwindcss(),
      tanstackStart(mode === "native" ? { spa: { enabled: true } } : undefined),
      ...((command === "build" || isPreview) && mode !== "native"
        ? [nitro({ preset: "vercel", routeRules: { "/**": { headers: SECURITY_HEADERS } } }), copyPgliteAssetsPlugin()]
        : []),
      viteReact(),
    ],
  };
});
