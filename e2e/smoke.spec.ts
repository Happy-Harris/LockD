import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog, waitForApp } from "./helpers";

test.describe("guest smoke", () => {
  test("a guest can open the app and start empty", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("button", { name: /Start empty/i }).click();
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  });

  test("the sample log loads and survives a reload", async ({ page }) => {
    await openWithSampleLog(page);
    await expect(page.getByText(/\d+ sessions/)).toBeVisible();
    await page.reload();
    await waitForApp(page);
    await expect(page.getByText(/\d+ sessions/)).toBeVisible();
  });

  test("Settings shows the history promise", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/settings");
    const promise = page.getByTestId("history-promise");
    await expect(promise).toContainText("Our promise");
    await expect(promise).toContainText("free, forever");
  });
});
