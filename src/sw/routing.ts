/**
 * What the service worker does with a request. Kept apart from the worker so it can be tested
 * without a browser (plan PR 6, docs/consolidation/PLAN.md § 6).
 *
 *  - `network`:     not ours; the worker does not touch it.
 *  - `cache-first`: a file that ships with this build (hashed scripts and styles, fonts, icons,
 *                   the manifest). Served from the device, so the app opens with no network.
 *  - `navigate`:    opening a screen. Network first, so an online lifter always gets the live page;
 *                   when the network is missing, slow or failing, the cached app shell instead.
 */
export type Strategy = "network" | "cache-first" | "navigate";

export interface RequestLike {
  url: string;
  method: string;
  mode: string;
}

/** Folders that are the server's business (or someone else's), never the shell's. */
const SERVER_DIRS = ["/_serverFn", "/api", "/auth"];

/** Dev and platform paths that start with two underscores (`/__grok/...`). */
const RESERVED_PREFIX = "/__";

/** Screens rendered on the server for people who are not in the app: they need the network. */
const PUBLIC_DIRS = ["/s", "/u", "/login"];

/** The worker script itself is never cached, so an update is always seen. */
const WORKER_PATH = "/sw.js";

/** `/s` matches `/s` and `/s/anything`, never `/sessions`. */
function inDir(path: string, dirs: readonly string[]): boolean {
  return dirs.some((dir) => path === dir || path.startsWith(`${dir}/`));
}

export function classify(
  request: RequestLike,
  origin: string,
  precached: ReadonlySet<string>,
): Strategy {
  if (request.method !== "GET") return "network";
  const url = new URL(request.url);
  if (url.origin !== origin) return "network";
  const path = url.pathname;
  if (path === WORKER_PATH || path.startsWith(RESERVED_PREFIX) || inDir(path, SERVER_DIRS))
    return "network";
  if (precached.has(path)) return "cache-first";
  if (request.mode === "navigate") return inDir(path, PUBLIC_DIRS) ? "network" : "navigate";
  return "network";
}

/** A server that answers 5xx is as good as no network: the shell still opens the app. */
export function shouldFallBackToShell(status: number): boolean {
  return status >= 500;
}

/** Wait this long for the network on a navigation before opening the shell instead. */
export const NAVIGATION_TIMEOUT_MS = 3000;

export const CACHE_PREFIX = "lockd-app-";
export const SHELL_PATH = "/__shell";
