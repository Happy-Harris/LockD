import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog, readLog } from "./helpers";

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

  test("Muscle sets: a personal target is saved, shown, and survives in the log", async ({
    page,
  }) => {
    await openWithSampleLog(page);
    await goTo(page, "/analytics");
    const card = page.getByTestId("muscle-sets");
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Edit personal targets" }).click();
    await page.getByTestId("target-editor").locator("select").selectOption("chest");
    await page.getByRole("spinbutton", { name: "Minimum sets" }).fill("12");
    await page.getByRole("spinbutton", { name: "Maximum sets" }).fill("16");
    await page.getByRole("button", { name: "Save personal target" }).click();
    await expect
      .poll(async () => (await readLog(page)).settings.personalMuscleTargets)
      .toEqual({ chest: { min: 12, max: 16 } });
    // The card is derived from the log: a chest row with sets this week now reads the saved range.
    const chest = card.getByTestId("muscle-row-chest");
    if (await chest.count()) await expect(chest).toContainText("12–16");

    // A range that makes no sense cannot be saved.
    await page.getByRole("spinbutton", { name: "Minimum sets" }).fill("30");
    await expect(page.getByRole("button", { name: "Save personal target" })).toBeDisabled();
  });

  test("Today's volume block shows credited sets against a range, under the Hypertrophy lens", async ({
    page,
  }) => {
    await openWithSampleLog(page);
    await page.getByRole("button", { name: "Hypertrophy", exact: true }).click();
    const block = page.getByTestId("today-volume");
    await expect(block).toBeVisible();
    // Never the old MEV/MAV/MRV labels.
    await expect(block).not.toContainText(/MEV|MAV|MRV/);
  });
});
