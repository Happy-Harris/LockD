import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Files in the built static output that are not part of the app: the worker itself, source maps,
 * and the scaffolding's install page. */
const SKIP = [/^sw\.js$/, /\.map$/];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** URL paths (`/assets/x.js`) of everything the worker should keep on the device, sorted. */
export function collectPrecache(staticDir) {
  return walk(staticDir)
    .map((file) => relative(staticDir, file).split(sep).join("/"))
    .filter((rel) => !SKIP.some((pattern) => pattern.test(rel)))
    .map((rel) => `/${rel}`)
    .sort();
}

/** Changes whenever any cached file changes, so a new build is a new worker and a new cache. */
export function buildIdOf(staticDir, paths) {
  const hash = createHash("sha256");
  for (const path of paths) {
    hash.update(path);
    hash.update(readFileSync(join(staticDir, path)));
  }
  return hash.digest("hex").slice(0, 12);
}
