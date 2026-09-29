import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildIdOf, collectPrecache } from "./sw-manifest.mjs";

const dirs: string[] = [];
function fakeBuild(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-manifest-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}
afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

const BUILD = {
  "assets/index-abc.js": "a",
  "assets/font-x.woff2": "f",
  "favicon.svg": "<svg/>",
  "manifest.webmanifest": "{}",
  "icon-192.png": "p",
  "sw.js": "old worker",
  "assets/index-abc.js.map": "map",
};

describe("collectPrecache", () => {
  it("lists what the app needs, sorted, without the worker or maps", () => {
    expect(collectPrecache(fakeBuild(BUILD) as string)).toEqual([
      "/assets/font-x.woff2",
      "/assets/index-abc.js",
      "/favicon.svg",
      "/icon-192.png",
      "/manifest.webmanifest",
    ]);
  });
});

describe("buildIdOf", () => {
  const idFor = (files: Record<string, string>) => {
    const dir = fakeBuild(files);
    return buildIdOf(dir, collectPrecache(dir));
  };

  it("is stable for the same build and short", () => {
    expect(idFor(BUILD)).toBe(idFor(BUILD));
    expect(idFor(BUILD)).toMatch(/^[0-9a-f]{12}$/);
  });

  it("changes when a cached file changes, is added or is removed", () => {
    const base = idFor(BUILD);
    expect(idFor({ ...BUILD, "assets/index-abc.js": "changed" })).not.toBe(base);
    expect(idFor({ ...BUILD, "assets/new.js": "n" })).not.toBe(base);
    const { "icon-192.png": _removed, ...without } = BUILD;
    expect(idFor(without)).not.toBe(base);
  });

  it("ignores the old worker and source maps", () => {
    expect(
      idFor({ ...BUILD, "sw.js": "a different old worker", "assets/index-abc.js.map": "m2" }),
    ).toBe(idFor(BUILD));
  });
});
