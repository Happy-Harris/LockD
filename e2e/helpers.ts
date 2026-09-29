import { expect, type Page } from "@playwright/test";

/** Wait until React has hydrated and the gym log has loaded (see GymGate in __root.tsx). */
export async function waitForApp(page: Page) {
  await expect(page.locator("html[data-gym-ready='true']")).toHaveCount(1, { timeout: 60_000 });
}

/** The saved log, read from the `lockd` database through the app's own repository. */
export async function readLog(page: Page) {
  return page.evaluate(async () => {
    const { DexieRepository } = await import("/src/lib/storage/dexie-repository.ts");
    return new DexieRepository().load();
  });
}

/** Wait until the database holds at least this many sessions (writes are asynchronous). */
export async function waitForSessions(page: Page, count = 1) {
  await expect
    .poll(async () => (await readLog(page)).workouts.length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(count);
}

/** Fresh guest: onboard with the sample log and wait for it to be saved. */
export async function openWithSampleLog(page: Page) {
  await page.goto("/");
  await waitForApp(page);
  await page.getByRole("button", { name: /Open with a sample log/i }).click();
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await waitForSessions(page);
}

/** Client-side navigation keeps the loaded log and avoids a full SSR round trip. */
export async function goTo(page: Page, path: string) {
  await page.goto(path);
  await waitForApp(page);
}
