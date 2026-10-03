import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog, waitForApp } from "./helpers";

// Web readiness gap 3: the privacy and terms drafts open without an account and are linked from Settings.
test.describe("privacy policy and terms", () => {
  test("open on a fresh browser with no log, marked as drafts", async ({ page }) => {
    for (const [path, title] of [
      ["/privacy", "Privacy policy"],
      ["/terms", "Terms of use"],
    ] as const) {
      await page.goto(path);
      await waitForApp(page);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole("note")).toContainText("DRAFT FOR OWNER AND LAWYER REVIEW");
      await expect(page.getByRole("button", { name: /Open with a sample log/i })).toHaveCount(0);
    }
  });

  test("are linked from Settings beside the promise", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/settings");
    await page.getByRole("link", { name: "Privacy policy" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
    await page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Terms" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Terms of use" })).toBeVisible();
  });
});
