import { expect, test } from "@playwright/test";
import { openWithSampleLog, waitForApp } from "./helpers";

// Web readiness gap 11: a useful page for a wrong address, and the small keyboard and screen-reader fixes.
test.describe("wrong addresses and keyboard paths", () => {
  test("an unknown address says so, returns 404 and leads back to Today", async ({ page }) => {
    await openWithSampleLog(page);
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await waitForApp(page);
    await expect(page.getByRole("heading", { level: 1, name: "Nothing at this address" })).toBeVisible();
    await page.getByRole("link", { name: "Go to Today" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  });

  test("the first Tab reaches Skip to content, which moves to the page", async ({ page }) => {
    await openWithSampleLog(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await skip.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("the workout name field has a name a screen reader can say", async ({ page }) => {
    await openWithSampleLog(page);
    await page.getByRole("button", { name: /Repeat last/i }).click();
    await waitForApp(page);
    await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible();
  });
});
