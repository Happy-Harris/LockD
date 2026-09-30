import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog, waitForApp } from "./helpers";

// playwright.config.ts turns sign-in on with Google and email, and leaves Apple off.
test.describe("sign-in", () => {
  test("offers exactly the configured methods", async ({ page }) => {
    await page.goto("/login");
    await waitForApp(page);
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Apple" })).toHaveCount(0);
    await expect(page.getByLabel("Or get a link by email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Email me a link" })).toBeVisible();
    await expect(page.getByTestId("sign-in-off")).toHaveCount(0);
  });

  test("a guest keeps logging and sees where to sign in", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/more");
    await expect(page.getByText("Sign in to keep this log")).toBeVisible();
  });
});
