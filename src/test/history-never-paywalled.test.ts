import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Principle 8, as a test: full history, charts and export are free, forever.
 *
 * Walks the import graph of every screen that shows history or charts and every export path,
 * and fails if anything reachable looks like a plan, entitlement or paywall check. If sync,
 * video storage or Lab compute are ever charged for, their gates must live outside this graph.
 * The same boundary is enforced at edit time by the `no-restricted-imports` block in
 * eslint.config.mjs; this test makes the promise hold even if that rule is disabled inline.
 */

const ROOT = path.resolve(__dirname, "../..");

const HISTORY_SURFACES = [
  "src/routes/history.tsx",
  "src/routes/history_.$id.tsx",
  "src/routes/chronicle.tsx",
  "src/routes/analytics.tsx",
  "src/routes/library_.$id.tsx",
  "src/routes/body.tsx",
  "src/routes/wrapped.tsx",
  "src/routes/moments.$id.tsx",
  "src/routes/workout_.$id.summary.tsx",
  "src/routes/settings.tsx",
  "src/lib/gym/csv.ts",
  "src/lib/import/strong.ts",
  "src/lib/import/hevy.ts",
  "src/lib/import/repforge.ts",
  "src/lib/import/knurl.ts",
  "src/lib/import/batch.ts",
  "src/lib/gym/store.ts",
];

const GATE_PATH = /(entitlement|billing|paywall|subscription|plan-gate|pricing)/i;
const GATE_CODE = /\b(isPro|isPremium|hasEntitlement|requireEntitlement|requirePlan|paywall|upgradeRequired)\b/;
const SPECIFIER = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];

function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(ROOT, "src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return null; // package import: outside our code
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function reachableModules(entries: string[]): string[] {
  const seen = new Set<string>();
  const queue = entries.map((entry) => path.join(ROOT, entry));
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(SPECIFIER)) {
      const resolved = resolveImport(file, match[1]!);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return [...seen];
}

function gateFindings(files: string[]): string[] {
  const findings: string[] = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    if (GATE_PATH.test(rel)) findings.push(`${rel}: module path looks like a plan/entitlement gate`);
    const code = GATE_CODE.exec(fs.readFileSync(file, "utf8"));
    if (code) findings.push(`${rel}: uses ${code[1]}`);
  }
  return findings;
}

describe("history is never paywalled", () => {
  it("every surface exists (so a rename can't silently shrink the guard)", () => {
    for (const surface of HISTORY_SURFACES) expect(fs.existsSync(path.join(ROOT, surface)), surface).toBe(true);
  });

  it("walks a real import graph", () => {
    const files = reachableModules(HISTORY_SURFACES).map((file) => path.relative(ROOT, file));
    expect(files).toContain("src/lib/gym/chronicle.ts");
    expect(files).toContain("src/domain/oneRepMax.ts");
  });

  it("no history, chart or export surface can reach a plan or entitlement check", () => {
    expect(gateFindings(reachableModules(HISTORY_SURFACES))).toEqual([]);
  });

  it("would catch a gate if one appeared", () => {
    const dir = fs.mkdtempSync(path.join(ROOT, "src/test/.tmp-gate-"));
    try {
      fs.writeFileSync(path.join(dir, "entitlements.ts"), "export const isPro = () => false;\n");
      fs.writeFileSync(path.join(dir, "screen.tsx"), 'import { isPro } from "./entitlements";\nexport const x = isPro;\n');
      const findings = gateFindings(reachableModules([path.relative(ROOT, path.join(dir, "screen.tsx"))]));
      expect(findings.length).toBeGreaterThanOrEqual(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the promise is published", () => {
  it("README states the same promise the app shows", async () => {
    const { HISTORY_PROMISE } = await import("@/lib/promise");
    const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
    expect(readme).toContain(HISTORY_PROMISE);
  });
});
