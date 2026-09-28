import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Flat ESLint config for the TanStack Start app-builder template. */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".output/**",
      ".vercel/**",
      ".nitro/**",
      "node_modules/**",
      "src/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Principle 8: history, charts and export are never paywalled. These surfaces may not
  // import anything that gates by plan or entitlement. Enforced again by
  // src/test/history-never-paywalled.test.ts, which walks the full import graph.
  {
    files: [
      "src/routes/history*.tsx",
      "src/routes/chronicle.tsx",
      "src/routes/analytics.tsx",
      "src/routes/library.$id.tsx",
      "src/routes/body.tsx",
      "src/routes/wrapped.tsx",
      "src/routes/moments.$id.tsx",
      "src/routes/workout.$id.summary.tsx",
      "src/routes/settings.tsx",
      "src/lib/gym/**/*.ts",
      "src/domain/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/*entitlement*", "**/*billing*", "**/*paywall*", "**/*subscription*", "**/*plan-gate*", "**/*pricing*"],
              message: "History, charts and export are free forever (principle 8). Gate sync, video or Lab compute outside these surfaces.",
            },
          ],
        },
      ],
    },
  },
  // Disable rules that conflict with Prettier formatting.
  prettier,
);
