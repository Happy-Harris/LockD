import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Unit and component tests. Kept separate from vite.config.ts so tests never load the
 * TanStack Start, Nitro or app-builder plugins. Component tests opt into jsdom with a
 * `// @vitest-environment jsdom` pragma; everything else runs in plain Node.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    // Legacy app-builder suites run under `node --test` (`npm run test:legacy`) and are
    // deleted with the scaffolding. They use node:test, not Vitest.
    exclude: [
      "node_modules/**",
      "src/lib/app-data/**",
      "src/lib/auth/gate-identity.test.ts",
      "src/lib/auth/sign-in-gate.test.ts",
    ],
    setupFiles: ["./src/test/setup.ts"],
  },
});
