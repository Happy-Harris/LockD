import { expect, type Page } from "@playwright/test";

/** Wait until React has hydrated and the gym log has loaded (see GymGate in __root.tsx). */
export async function waitForApp(page: Page) {
  await expect(page.locator("html[data-gym-ready='true']")).toHaveCount(1, { timeout: 60_000 });
}

/** Fresh guest: onboard with the sample log and wait for it to persist. */
export async function openWithSampleLog(page: Page) {
  await page.goto("/");
  await waitForApp(page);
  await page.getByRole("button", { name: /Open with a sample log/i }).click();
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
}

/** Client-side navigation keeps the loaded log and avoids a full SSR round trip. */
export async function goTo(page: Page, path: string) {
  await page.goto(path);
  await waitForApp(page);
}
