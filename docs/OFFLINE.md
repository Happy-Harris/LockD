# Offline

Lock'd opens and works with no network, for guests and signed-in lifters alike: the log lives on the
device (see `docs/consolidation/PLAN.md` § 4) and a service worker keeps the app itself there too.

## How it works

- **`/sw.js`** is built after the app by `scripts/build-sw.mjs` from `src/sw/worker.ts`. It is only
  registered in the production build (`src/lib/pwa/start.ts`); the dev server has none.
- **On install** it caches every file in the build (`/assets/*`, fonts, icons, the manifest) and the
  **app shell**: the app's own page fetched **without cookies**, so it is the guest page and holds
  nothing of any signed-in lifter. The shell is the same for every screen (the app waits for the log
  to load before drawing anything else), so it hydrates whichever screen was asked for.
- **Files from the build** are served from the device, first.
- **Opening a screen** goes to the network first. If that fails, takes over 3 seconds, or the server
  answers 5xx, the shell opens instead and the app draws the screen from the log on the device.
- **Never touched by the worker:** the server's data calls (`/_serverFn/*`, `/api/*`, `/auth/*`),
  anything that is not a GET, other origins, and the public share and profile screens (`/s/*`,
  `/u/*`, `/login`), which need the server.
- **Updates wait for the lifter.** A new build is a new worker with a new cache. It installs in the
  background and the app offers "A new version is ready"; only Reload makes it take over. The old
  cache is deleted when the new worker activates. The first install is not an update and shows no
  prompt.

## Testing

- Unit: `src/sw/routing.test.ts`, `src/lib/pwa/register.test.ts`, `scripts/sw-manifest.test.ts`.
- End to end, against the production build: `npm run test:e2e:offline` (builds, then runs
  `e2e-offline/`): cold start with no network, log a workout, see it in History and Chronicle,
  reload, still there; an update waiting then applying; the public screens still needing the network.

## If a worker ever misbehaves

Ship a `sw.js` that unregisters itself and clears the `lockd-app-*` caches. Browsers check for a new
worker script on every load, so it reaches devices the next time the app is opened online. The log
is in IndexedDB and is not affected by the worker or its caches.
