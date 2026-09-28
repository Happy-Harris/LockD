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
});
