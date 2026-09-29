import {
  CACHE_PREFIX,
  classify,
  NAVIGATION_TIMEOUT_MS,
  shouldFallBackToShell,
  SHELL_PATH,
} from "./routing";

/**
 * The service worker. Bundled to `/sw.js` after the app is built (`scripts/build-sw.mjs`), which
 * fills in the two build-time constants below. It caches what ships with the build and the app
 * shell so the app opens with no network. It never handles the server's data calls, and it never
 * takes over from an older worker until the lifter accepts the update prompt.
 */
declare const __PRECACHE__: string[];
declare const __BUILD_ID__: string;

interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEventLike extends ExtendableEventLike {
  request: Request;
  respondWith(response: Promise<Response> | Response): void;
}
interface MessageEventLike {
  data?: { type?: string };
}
interface WorkerScope {
  location: { origin: string };
  addEventListener(
    type: "install" | "activate",
    listener: (event: ExtendableEventLike) => void,
  ): void;
  addEventListener(type: "fetch", listener: (event: FetchEventLike) => void): void;
  addEventListener(type: "message", listener: (event: MessageEventLike) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
}

const scope = self as unknown as WorkerScope;
const CACHE = `${CACHE_PREFIX}${__BUILD_ID__}`;
const PRECACHED = new Set(__PRECACHE__);

async function precache(): Promise<void> {
  const cache = await caches.open(CACHE);
  await Promise.all(
    __PRECACHE__.map(async (path) => {
      const response = await fetch(path, { cache: "reload" });
      if (!response.ok) throw new Error(`Could not cache ${path}: ${response.status}`);
      await cache.put(path, response);
    }),
  );
  // The shell is the app's own page as a guest sees it. Fetched without cookies, so nothing of a
  // signed-in lifter is ever kept in it, and it hydrates the same for any screen (see GymGate).
  const shell = await fetch("/", { credentials: "omit", cache: "reload" });
  const type = shell.headers.get("content-type") ?? "";
  if (!shell.ok || !type.includes("text/html")) throw new Error("Could not cache the app shell");
  await cache.put(SHELL_PATH, shell);
}

async function forgetOldCaches(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
      .map((name) => caches.delete(name)),
  );
}

function withTimeout(promise: Promise<Response>, ms: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("network timeout")), ms);
    promise.then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function shell(): Promise<Response> {
  const cache = await caches.open(CACHE);
  return (await cache.match(SHELL_PATH)) ?? Response.error();
}

async function navigate(request: Request): Promise<Response> {
  try {
    const response = await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
    if (!shouldFallBackToShell(response.status)) return response;
  } catch {
    // offline, slow or refused: open the shell
  }
  return shell();
}

async function fromDevice(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(new URL(request.url).pathname);
  return hit ?? fetch(request);
}

scope.addEventListener("install", (event) => {
  // No skipWaiting here: an update waits until the lifter accepts the prompt.
  event.waitUntil(precache());
});

scope.addEventListener("activate", (event) => {
  event.waitUntil(forgetOldCaches().then(() => scope.clients.claim()));
});

scope.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void scope.skipWaiting();
});

scope.addEventListener("fetch", (event) => {
  const strategy = classify(event.request, scope.location.origin, PRECACHED);
  if (strategy === "cache-first") event.respondWith(fromDevice(event.request));
  else if (strategy === "navigate") event.respondWith(navigate(event.request));
});
