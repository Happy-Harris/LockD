import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog } from "./helpers";

test.describe("critical fixes", () => {
  test("I-4: a guest can't trigger a Lab model call", async ({ page }) => {
    await openWithSampleLog(page);
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(request.url());
    });
    await goTo(page, "/lab");
    await expect(page.getByTestId("lab-guest-note")).toContainText("Sign in");
    await expect(page.getByRole("button", { name: /Ask the Lab|Ask again/i })).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(posts).toEqual([]);
  });

  test("I-1: the Train tab and a routine open without crashing", async ({ page }) => {
    const crashes: string[] = [];
    page.on("console", (message) => {
      if (/Maximum update depth/.test(message.text())) crashes.push(message.text());
    });
    await openWithSampleLog(page);
    await goTo(page, "/routines");
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await expect(page.getByText("Push Day").first()).toBeVisible();
    await page.getByText("Push Day").first().click();
    await expect(page).toHaveURL(/\/routines\/.+/);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    expect(crashes).toEqual([]);
  });
});
