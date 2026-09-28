#!/usr/bin/env node
/**
 * Stale-brand check for user-facing strings.
 *
 * Flags RepForge, Strong-Pro, Certified, Knurl and Grok wherever a user could read them:
 * JSX text, and string or template literals that read like copy. "Strong" alone is allowed
 * (it names the Strong app as an import source).
 *
 * Not flagged: module specifiers, and identifier-like strings with no whitespace
 * (`grok-google`, `/__grok/manifest.webmanifest`, `GROK_AUTH_ISSUER`) — those are internal
 * identifiers, and renaming live identifiers is a migration, not a cleanup. A bare brand word
 * used as a whole string ("Grok") is still flagged, because that is how labels look.
 *
 * Findings listed in scripts/lockd-brand-allowlist.json are reported but don't fail.
 * Default mode only reports. `--strict` exits 1 on any finding not on the allowlist.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const BANNED = /\b(rep\s?forge|strong[\s-]?pro|certified|knurl|grok)\b/i;
const IDENTIFIER_LIKE = /^[\w./:@#?=&$*+~-]+$/;
const BARE_BRAND = /^(RepForge|Strong-?Pro|Certified|Knurl|Grok)$/;

function isModuleSpecifier(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return true;
  if (ts.isExternalModuleReference(parent)) return true;
  if (ts.isCallExpression(parent)) {
    const callee = parent.expression;
    if (callee.kind === ts.SyntaxKind.ImportKeyword) return true;
    if (ts.isIdentifier(callee) && callee.text === "require") return true;
  }
  return false;
}

function isCopy(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (BARE_BRAND.test(trimmed)) return true;
  return !IDENTIFIER_LIKE.test(trimmed);
}

/** Pure scanner: returns every banned term in user-facing strings of one source file. */
export function findBrandViolations(sourceText, fileName = "file.tsx") {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, kind);
  const found = [];
  const report = (node, text) => {
    const match = BANNED.exec(text);
    if (!match || !isCopy(text)) return;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push({ line: line + 1, term: match[1], text: text.trim().replace(/\s+/g, " ").slice(0, 120) });
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) report(node, node.text);
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!isModuleSpecifier(node)) report(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      const text = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ");
      report(node, text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) && entry.name !== "routeTree.gen.ts") {
      out.push(full);
    }
  }
  return out;
}

export function loadAllowlist(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8")).entries;
}

export function isAllowed(allowlist, relFile, finding) {
  return allowlist.some((entry) => entry.file === relFile && finding.text.includes(entry.contains));
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const strict = process.argv.includes("--strict");
  const allowlist = loadAllowlist(path.join(root, "scripts/lockd-brand-allowlist.json"));
  let failing = 0;
  let allowed = 0;
  for (const file of listFiles(path.join(root, "src"))) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    for (const finding of findBrandViolations(fs.readFileSync(file, "utf8"), file)) {
      if (isAllowed(allowlist, rel, finding)) {
        allowed += 1;
        continue;
      }
      failing += 1;
      console.log(`${rel}:${finding.line}  [${finding.term}]  ${finding.text}`);
    }
  }
  const summary = `brand check: ${failing} finding(s), ${allowed} allowlisted`;
  if (failing > 0 && strict) {
    console.error(`${summary} — failing (--strict).`);
    process.exit(1);
  }
  console.log(failing > 0 ? `${summary} — report only (run with --strict to fail).` : summary);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
