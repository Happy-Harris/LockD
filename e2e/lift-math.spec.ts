import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog, readLog } from "./helpers";

/** Lift Math, step B (owner's spec, Appendix A): the screen, its receipt, the plate link, and nothing saved. */

test.describe("Lift Math", () => {
  test("an estimate shows its receipt and the other formula; a comma parses like a point", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/tools");
    await page.getByRole("link", { name: /Lift Math/ }).click();
    await expect(page.getByRole("heading", { name: "Lift Math", level: 1 })).toBeVisible();

    // Nothing typed: no number, no 0, no dash.
    await expect(page.getByTestId("lift-math-result")).toHaveCount(0);

    await page.getByLabel("Load (kg)").fill("100");
    await page.getByLabel("Reps").fill("5");
    const result = page.getByTestId("lift-math-result");
    await expect(result).toContainText("116.67 kg");
    await expect(page.getByTestId("lift-math-receipt")).toHaveText("Epley · 100 kg × 5 at RPE 10");
    await expect(page.getByTestId("lift-math-other")).toHaveText("Brzycki: 112.5 kg");
    await expect(page.getByTestId("lift-math-percent")).toContainText("85%");

    await page.getByLabel("Load (kg)").fill("100,0");
    await expect(result).toContainText("116.67 kg");

    // RPE 9 on that set is RIR 1: r = 6, and the result says it is RIR-adjusted.
    await page.getByLabel("RPE on that set").fill("9");
    await expect(result).toContainText("RIR-adjusted");
    await expect(result).toContainText("120 kg");

    // Over the cap: an inline message, and no number.
    await page.getByLabel("Reps").fill("10");
    await page.getByLabel("RPE on that set").fill("7");
    await expect(page.getByTestId("lift-math-error")).toHaveText(
      "Reps plus RIR can't go past 12. Beyond that, these formulas stop being useful.",
    );
    await expect(page.getByLabel("Reps")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("lift-math-result")).toHaveCount(0);
  });

  test("a target load hands its rounded load to the plate calculator, and Back keeps the inputs", async ({ page }) => {
    await openWithSampleLog(page);
    const before = await readLog(page);
    await goTo(page, "/tools/lift-math");
    await page.getByRole("button", { name: "Estimated load" }).click();
    await page.getByLabel("1RM (kg)").fill("116.67");
    await page.getByLabel("Reps").fill("8");
    await page.getByLabel("Target RPE").fill("8");
    await expect(page.getByTestId("lift-math-result")).toContainText("87.5 kg");
    await expect(page.getByTestId("lift-math-rounded")).toHaveText("Nearest loadable · 2.5 kg steps: 87.5 kg");

    await page.getByRole("link", { name: "Load it on the bar" }).click();
    await expect(page).toHaveURL(/\/tools\/plates\?/);
    await expect(page.getByLabel(/Target/)).toHaveValue("87.5");

    await page.goBack();
    await expect(page.getByLabel("1RM (kg)")).toHaveValue("116.67");
    await expect(page.getByLabel("Target RPE")).toHaveValue("8");

    // Nothing Lift Math did reached the log, the plates or settings.
    const after = await readLog(page);
    expect(after.settings).toEqual(before.settings);
    expect(after.plates).toEqual(before.plates);
    expect(after.workouts.length).toBe(before.workouts.length);
  });

  test("the palette finds it by 1RM, RPE and percent", async ({ page }) => {
    await openWithSampleLog(page);
    for (const word of ["1rm", "rpe", "percent"]) {
      await page.keyboard.press("ControlOrMeta+k");
      await page.getByPlaceholder(/jump/).fill(word);
      await expect(page.getByRole("button", { name: "Lift Math" })).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });
});
