import { describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./register";

/** A minimal service worker container and registration, driven by the test. */
function fakes(opts: { controlled: boolean; waiting?: boolean }) {
  const containerListeners = new Map<string, Array<() => void>>();
  const registrationListeners = new Map<string, Array<() => void>>();
  const workerListeners: Array<() => void> = [];
  const posted: unknown[] = [];
  const worker = {
    state: "installing",
    postMessage: (message: unknown) => void posted.push(message),
    addEventListener: (_type: string, fn: () => void) => void workerListeners.push(fn),
  };
  const registration = {
    installing: null as typeof worker | null,
    waiting: opts.waiting ? worker : null,
    addEventListener: (type: string, fn: () => void) => {
      registrationListeners.set(type, [...(registrationListeners.get(type) ?? []), fn]);
    },
    update: vi.fn(async () => undefined),
  };
  const container = {
    controller: opts.controlled ? {} : null,
    register: vi.fn(async () => registration),
    addEventListener: (type: string, fn: () => void) => {
      containerListeners.set(type, [...(containerListeners.get(type) ?? []), fn]);
    },
  };
  return {
    container: container as unknown as ServiceWorkerContainer,
    registration,
    worker,
    posted,
    foundUpdate() {
      registration.installing = worker;
      registrationListeners.get("updatefound")?.forEach((fn) => fn());
      worker.state = "installed";
      workerListeners.forEach((fn) => fn());
    },
    takeControl() {
      containerListeners.get("controllerchange")?.forEach((fn) => fn());
    },
  };
}

describe("registerServiceWorker", () => {
  it("registers at the root and does not prompt for the first install", async () => {
    const f = fakes({ controlled: false });
    const onUpdateReady = vi.fn();
    await registerServiceWorker({ container: f.container, onUpdateReady, reload: vi.fn() });
    expect(f.container.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    f.foundUpdate(); // installs, but nothing controls the page yet: not an update
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it("offers an update found while a worker already controls the page, once", async () => {
    const f = fakes({ controlled: true });
    const onUpdateReady = vi.fn();
    await registerServiceWorker({ container: f.container, onUpdateReady, reload: vi.fn() });
    f.foundUpdate();
    f.foundUpdate();
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it("offers an update that was already waiting when the page opened", async () => {
    const f = fakes({ controlled: true, waiting: true });
    const onUpdateReady = vi.fn();
    await registerServiceWorker({ container: f.container, onUpdateReady, reload: vi.fn() });
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it("applying tells the waiting worker to take over, and reloads once it does", async () => {
    const f = fakes({ controlled: true });
    const reload = vi.fn();
    let apply: () => void = () => undefined;
    await registerServiceWorker({
      container: f.container,
      onUpdateReady: (fn) => (apply = fn),
      reload,
    });
    f.foundUpdate();

    apply();
    expect(f.posted).toEqual([{ type: "SKIP_WAITING" }]);
    expect(reload).not.toHaveBeenCalled(); // not until the new worker is in control
    f.takeControl();
    f.takeControl();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("can be asked to look for an update now", async () => {
    const f = fakes({ controlled: true });
    const { checkForUpdate } = await registerServiceWorker({
      container: f.container,
      onUpdateReady: vi.fn(),
      reload: vi.fn(),
    });
    await checkForUpdate();
    expect(f.registration.update).toHaveBeenCalledTimes(1);
  });
});
