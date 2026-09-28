import { describe, expect, it } from "vitest";
import { findBrandViolations, isAllowed } from "./lockd-brand-check.mjs";

const terms = (source: string, file = "x.tsx") =>
  (findBrandViolations(source, file) as Array<{ term: string }>).map((f) => f.term.toLowerCase());

describe("lockd brand check", () => {
  it("flags every banned brand in JSX text", () => {
    const source = `export const A = () => <p>Built by RepForge, Strong-Pro, Certified, Knurl and Grok.</p>;`;
    expect(findBrandViolations(source, "a.tsx")).toHaveLength(1);
    expect(terms(`const a = <p>Knurl OS</p>;`)).toEqual(["knurl"]);
  });

  it("flags copy in string and template literals", () => {
    expect(terms(`const label = "Ask Grok again";`)).toEqual(["grok"]);
    expect(terms("const t = `Welcome to ${'x'} Certified training`;")).toEqual(["certified"]);
    expect(terms(`const t = "strong pro tips";`)).toEqual(["strong pro"]);
  });

  it("flags a bare brand word used as a whole label", () => {
    expect(terms(`const label = "Grok";`)).toEqual(["grok"]);
    expect(terms(`const label = "RepForge";`)).toEqual(["repforge"]);
  });

  it("allows Strong as an import source", () => {
    expect(terms(`const a = <p>Import your Strong CSV export</p>;`)).toEqual([]);
  });

  it("ignores module specifiers and identifier-like internal strings", () => {
    const source = [
      `import x from "./grok-pwa";`,
      `export * from "../grok/shared";`,
      `const p = { providerId: "grok-google", href: "/__grok/manifest.webmanifest" };`,
      `const env = process.env["GROK_AUTH_ISSUER"];`,
      `const format = "repforge-backup";`,
    ].join("\n");
    expect(findBrandViolations(source, "b.ts")).toEqual([]);
  });

  it("reports the line of each finding", () => {
    const [finding] = findBrandViolations(`const a = 1;\nconst b = "Made with Grok";`, "c.ts");
    expect(finding).toMatchObject({ line: 2, term: "Grok" });
  });

  it("matches allowlist entries by file and substring only", () => {
    const allowlist = [{ file: "src/a.ts", contains: "Grok user", reason: "test" }];
    expect(isAllowed(allowlist, "src/a.ts", { text: "Grok user" })).toBe(true);
    expect(isAllowed(allowlist, "src/b.ts", { text: "Grok user" })).toBe(false);
    expect(isAllowed(allowlist, "src/a.ts", { text: "Ask Grok" })).toBe(false);
  });
});
