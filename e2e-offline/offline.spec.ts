import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { waitForApp } from "../e2e/helpers";

/** Wait until the service worker controls this page, which means the shell and files are cached. */
async function waitForWorkerControl(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 30_000,
    })
    .toBe(true);
}

/** Load the app once, online, so the worker installs and caches everything. */
async function primeOnline(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto("/");
  await waitForApp(page);
  await waitForWorkerControl(page);
  await page.close();
}

test.describe("the app works with no network", () => {
  test("cold start offline, log a workout, see it in History and Chronicle, reload, still there", async ({
    context,
  }) => {
    await primeOnline(context);
    await context.setOffline(true);

    // A brand new page with no network at all: served by the worker.
    const page = await context.newPage();
    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("button", { name: /Open with a sample log/i }).click();
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: /Repeat last/i }).click();
    await expect(page).toHaveURL(/\/workout$/);
    await waitForApp(page);
    await page.getByRole("button", { name: "Complete set" }).first().click();
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page).toHaveURL(/\/workout\/.+\/summary$/);
    await expect(page.getByRole("heading", { level: 1, name: "Keep the receipt." })).toBeVisible();

    // Screens that were never opened: opened cold offline, their code comes from the device.
    await page.goto("/history");
    await waitForApp(page);
    await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible();
    const sessionsBefore = await page.getByRole("link").filter({ hasText: /sets/ }).count();
    expect(sessionsBefore).toBeGreaterThan(100);

    await page.goto("/chronicle");
    await waitForApp(page);
    await expect(page.getByRole("heading", { name: "The lifting life.", level: 1 })).toBeVisible();
    await expect(page.getByText("Something went wrong")).toHaveCount(0);

    // Lift Math, opened for the first time with the network off (spec, Appendix A).
    await page.goto("/tools/lift-math");
    await waitForApp(page);
    await page.getByLabel("Load (kg)").fill("100");
    await page.getByLabel("Reps").fill("5");
    await expect(page.getByTestId("lift-math-result")).toContainText("116.67 kg");

    // Reload offline: the log is still there.
    await page.reload();
    await waitForApp(page);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await page.goto("/history");
    await waitForApp(page);
    expect(await page.getByRole("link").filter({ hasText: /sets/ }).count()).toBe(sessionsBefore);
    await context.setOffline(false);
  });

  test("the public share and profile screens still need the network", async ({ context }) => {
    await primeOnline(context);
    await context.setOffline(true);
    const page = await context.newPage();
    const response = await page.goto("/s/anything").catch(() => null);
    // No worker shell for these: the browser's own offline page, not the app.
    expect(response).toBeNull();
    await context.setOffline(false);
  });

  test("an update waits for the lifter, then applies when they accept it", async ({ context }) => {
    const page = await context.newPage();
    await page.goto("/");
    await waitForApp(page);
    await waitForWorkerControl(page);
    // The first install is not an update: no prompt.
    await expect(page.getByText("A new version is ready")).toHaveCount(0);

    const cacheNames = () => page.evaluate(async () => (await caches.keys()).sort());
    const [oldCache] = await cacheNames();
    expect(oldCache).toMatch(/^lockd-app-[0-9a-f]{12}$/);
    const oldId = oldCache!.replace("lockd-app-", "");

    // Publish a "new build": the same worker with another build id, so the browser sees a new
    // worker with a new cache. (Playwright cannot intercept the browser's own check for a new
    // worker script, so the built file is swapped on disk; the preview server reads it per request.)
    const workerFile = fileURLToPath(new URL("../.vercel/output/static/sw.js", import.meta.url));
    const original = fs.readFileSync(workerFile, "utf8");
    try {
      fs.writeFileSync(workerFile, original.split(oldId).join("e2ev2000000"));
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
      });

      await expect(page.getByText("A new version is ready")).toBeVisible();
      // Waiting, not applied: both caches exist and the old worker still controls the page.
      await expect.poll(cacheNames).toEqual([oldCache, "lockd-app-e2ev2000000"].sort());

      await page.getByRole("button", { name: "Reload" }).click();
      await waitForApp(page);
      // Applied: the old cache is gone and the page is controlled by the new worker.
      await expect.poll(cacheNames).toEqual(["lockd-app-e2ev2000000"]);
      await waitForWorkerControl(page);
      await expect(page.getByText("A new version is ready")).toHaveCount(0);
    } finally {
      fs.writeFileSync(workerFile, original);
    }
  });
});
