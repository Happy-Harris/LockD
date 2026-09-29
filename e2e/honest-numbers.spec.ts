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

  test("goal lifts are the lifter's own: picked in a sheet, saved, and shown in Settings", async ({
    page,
  }) => {
    await openWithSampleLog(page);
    await goTo(page, "/analytics");
    await page.getByRole("button", { name: /^(Edit|Choose)$/ }).click();
    const picker = page.getByTestId("goal-lift-picker");
    await expect(picker).toBeVisible();
    // Start from none, pick two, save.
    await picker.getByRole("button", { name: "Use my top lifts instead" }).click();
    await page.getByRole("button", { name: /^(Edit|Choose)$/ }).click();
    await picker.getByRole("searchbox").fill("Overhead Press");
    await picker
      .getByRole("button", { name: /Overhead Press/ })
      .first()
      .click();
    await picker.getByRole("searchbox").fill("Barbell Row");
    await picker
      .getByRole("button", { name: /Barbell Row/ })
      .first()
      .click();
    await picker.getByRole("button", { name: "Save" }).click();
    await goTo(page, "/settings");
    await expect(page.getByTestId("goal-lifts-summary")).toContainText(
      "Overhead Press, Barbell Row",
    );
  });

  test("a goal lift's estimate says what it is, rounds to a step, and shows its source set", async ({
    page,
  }) => {
    await openWithSampleLog(page);
    await page.getByRole("button", { name: "Strength", exact: true }).click();
    const goals = page
      .getByText("Goal lifts", { exact: true })
      .locator("xpath=ancestor::section[1]");
    await expect(goals).toContainText("Est. 1RM");
    await expect(goals).toContainText(/from [\d.]+ kg × \d+/);
    // Never to the gram: whole or half kilograms only.
    const text = await goals.innerText();
    for (const m of text.matchAll(/(\d+(?:\.\d+)?) kg\n/g)) expect(m[1]).toMatch(/^\d+(\.5)?$/);
  });
});
