import { toast } from "sonner";
import { registerServiceWorker, UPDATE_CHECK_INTERVAL_MS } from "./register";

let started = false;

/** Production only: the dev server has no `/sw.js`, and a worker would hide edits. */
export function startServiceWorker() {
  if (started || !import.meta.env.PROD) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  started = true;

  registerServiceWorker({
    container: navigator.serviceWorker,
    reload: () => window.location.reload(),
    onUpdateReady: (apply) => {
      toast("A new version is ready", {
        description: "Reload to use it. Your log is saved on this device and stays as it is.",
        duration: Infinity,
        action: { label: "Reload", onClick: apply },
      });
    },
  })
    .then(({ checkForUpdate }) => {
      const check = () => void checkForUpdate().catch(() => undefined);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    })
    .catch((error: unknown) => console.warn("Service worker not registered.", error));
}
