import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog } from "./helpers";

test.describe("numbers that say only what the log knows", () => {
  test("'Last trained' gives days, and never calls a muscle fresh or ready", async ({ page }) => {
    await openWithSampleLog(page);
    await page.getByRole("button", { name: "Hybrid", exact: true }).click();
    const block = page.getByTestId("today-last-trained");
    await expect(block).toBeVisible();
    await expect(block).toContainText(/Today|Yesterday|days ago|No sets logged/);
    await expect(block).not.toContainText(/Fresh|Ready|Recovering|Loaded/);
    await expect(page.getByText("Recovery", { exact: true })).toHaveCount(0);
  });

  test("a lift shows est. 1RM ÷ body weight as a plain number, with no band", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/library/seed-bench-press");
    const card = page.getByTestId("relative-strength");
    await expect(card).toBeVisible();
    await expect(card).toContainText(/\d\.\d\d×/);
    await expect(card).toContainText("Est. 1RM");
    await expect(
      page.getByText(/Strength standard|Novice|Intermediate|Advanced|Elite/),
    ).toHaveCount(0);
  });
});
