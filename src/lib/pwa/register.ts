/**
 * Registers the service worker and offers updates (plan PR 6, § 6).
 *
 * An update never applies by itself: the new worker installs and waits, the app says a new version
 * is ready, and only when the lifter taps Reload does the waiting worker take over and the page
 * reload. (Strong-Pro's first version only reloaded, which left the old worker running; the fix
 * that made the prompt apply the update is what `apply` does here.)
 */

export interface RegisterDeps {
  container: ServiceWorkerContainer;
  /** Called when a new version is ready. `apply` switches to it and reloads. */
  onUpdateReady: (apply: () => void) => void;
  reload: () => void;
  scriptUrl?: string;
}

export interface Registered {
  registration: ServiceWorkerRegistration;
  /** Asks the browser to look for a new worker now. */
  checkForUpdate: () => Promise<void>;
}

export async function registerServiceWorker(deps: RegisterDeps): Promise<Registered> {
  const { container } = deps;
  const registration = await container.register(deps.scriptUrl ?? "/sw.js", { scope: "/" });

  let reloading = false;
  let offered = false;

  const offer = (worker: ServiceWorker) => {
    if (offered) return;
    offered = true;
    deps.onUpdateReady(() => {
      container.addEventListener(
        "controllerchange",
        () => {
          if (reloading) return;
          reloading = true;
          deps.reload();
        },
        { once: true },
      );
      worker.postMessage({ type: "SKIP_WAITING" });
    });
  };

  // A worker is only an *update* when another one already controls this page. The first install
  // has nothing to replace and needs no prompt.
  if (registration.waiting && container.controller) offer(registration.waiting);

  registration.addEventListener("updatefound", () => {
    const incoming = registration.installing;
    if (!incoming) return;
    incoming.addEventListener("statechange", () => {
      if (incoming.state === "installed" && container.controller) offer(incoming);
    });
  });

  return { registration, checkForUpdate: () => registration.update().then(() => undefined) };
}

/** How often an open app looks for a new version, besides when it comes back to the foreground. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
