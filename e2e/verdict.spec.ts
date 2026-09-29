import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog } from "./helpers";

test.describe("the weekly verdict", () => {
  test("Today words last week and opens the numbers behind it", async ({ page }) => {
    await openWithSampleLog(page);
    // The default lens (Powerbuilding) keeps the verdict on Data Lab; Strength shows it here too.
    await expect(page.getByTestId("weekly-verdict")).toHaveCount(0);
    await page.getByRole("button", { name: "Strength", exact: true }).click();
    const card = page.getByTestId("weekly-verdict");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Weekly verdict");
    await expect(card).toContainText("Wording follows your lens: Strength.");
    // A direction stamp appears only when the log can back one.
    await expect(page.getByTestId("verdict-stamp")).toBeVisible();

    await card
      .getByRole("button", { name: /hard sets\. Show evidence/ })
      .first()
      .click();
    const evidence = page.getByRole("dialog");
    await expect(evidence).toBeVisible();
    await expect(page.getByTestId("verdict-evidence")).toContainText("Baseline weeks");
    await page.keyboard.press("Escape");
    await expect(evidence).toHaveCount(0);
  });

  test("Data Lab has the verdict and the change flags, each with a receipt", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/analytics");
    await expect(page.getByTestId("weekly-verdict")).toBeVisible();
    const flags = page.getByTestId("change-flags");
    await expect(flags).toBeVisible();
    await expect(flags).toContainText("Not a program");
  });
});
