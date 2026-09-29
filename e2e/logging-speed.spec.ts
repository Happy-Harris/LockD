import { expect, test, type Page } from "@playwright/test";
import { openWithSampleLog, readLog, waitForApp } from "./helpers";

/**
 * Principle 1: logging speed never regresses. These pin what a lifter feels between sets:
 * one tap completes a set and starts the rest timer, values are already filled in, typed values win,
 * and the workout survives a reload. The budgets are generous on purpose (CI runs the dev server);
 * they catch a re-render storm or an extra step, not a few milliseconds.
 */
const TAP_TO_REST_BUDGET_MS = 1500;

async function startRepeatLast(page: Page) {
  await openWithSampleLog(page);
  await page.getByRole("button", { name: /Repeat last/i }).click();
  await expect(page.getByRole("button", { name: "Complete set" }).first()).toBeVisible();
}

const restBar = (page: Page) => page.getByText("Rest", { exact: true });

test.describe("logging speed (principle 1)", () => {
  test("a whole workout is logged with one tap per set and nothing else", async ({ page }) => {
    await startRepeatLast(page);
    const buttons = page.getByRole("button", { name: "Complete set" });
    const total = await buttons.count();
    expect(total).toBeGreaterThan(0);

    // Values arrive prefilled from last time, so completing is the only action a lifter needs.
    let taps = 0;
    while ((await page.getByRole("button", { name: "Complete set" }).count()) > 0) {
      await page.getByRole("button", { name: "Complete set" }).first().click();
      taps += 1;
      expect(taps).toBeLessThanOrEqual(total);
    }
    expect(taps).toBe(total);
    await expect(page.locator("header p").first()).toContainText(`${total}/${total} sets`);
    const log = await readLog(page);
    const active = log.workouts.find((w) => w.status === "active")!;
    const sets = log.workoutSets.filter((s) => s.workoutId === active.id);
    expect(sets.every((s) => s.isCompleted)).toBe(true);
    // Every working set of a weight-and-reps exercise kept last time's numbers: nothing was typed.
    // (Warm-ups and bodyweight sets carry no working load by design.)
    const kinds = new Map(
      log.workoutExercises
        .filter((row) => row.workoutId === active.id)
        .map((row) => [row.id, row.trackingTypeSnapshot]),
    );
    const loaded = sets.filter(
      (s) => s.setType === "working" && kinds.get(s.workoutExerciseId) === "weight_reps",
    );
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.every((s) => (s.weightG ?? 0) > 0 && (s.reps ?? 0) > 0)).toBe(true);
  });

  test("one tap completes the set and starts the rest timer within the budget", async ({
    page,
  }) => {
    await startRepeatLast(page);
    await expect(restBar(page)).toHaveCount(0);
    const started = Date.now();
    await page.getByRole("button", { name: "Complete set" }).first().click();
    await expect(restBar(page)).toBeVisible({ timeout: TAP_TO_REST_BUDGET_MS });
    const took = Date.now() - started;
    console.log(`tap to rest timer: ${took} ms (budget ${TAP_TO_REST_BUDGET_MS} ms)`);
    expect(took).toBeLessThan(TAP_TO_REST_BUDGET_MS);
  });

  test("previous values are inline and a typed value wins over them", async ({ page }) => {
    await startRepeatLast(page);
    await expect(page.getByText(/^Ghost /).first()).toBeVisible();
    const weight = page.getByRole("textbox", { name: /Set 1 weight/ }).first();
    await weight.fill("87.5");
    await page.getByRole("button", { name: "Complete set" }).first().click();
    // The store writes asynchronously; wait for the typed set to land, then check exactly one set has it.
    await expect
      .poll(async () => {
        const log = await readLog(page);
        const active = log.workouts.find((w) => w.status === "active")!;
        return log.workoutSets
          .filter((s) => s.workoutId === active.id && s.weightG === 87_500)
          .map((s) => s.isCompleted);
      })
      .toEqual([true]);
  });

  test("the active workout and the rest timer survive a reload", async ({ page }) => {
    await startRepeatLast(page);
    await page.getByRole("button", { name: "Complete set" }).first().click();
    await expect(restBar(page)).toBeVisible();
    const before = await page.locator("header p").first().innerText();
    await expect
      .poll(async () => (await readLog(page)).workoutSets.some((s) => s.isCompleted))
      .toBe(true);

    await page.reload();
    await waitForApp(page);
    await expect(page).toHaveURL(/\/workout$/);
    await expect(page.getByRole("button", { name: "Complete set" }).first()).toBeVisible();
    // The completed set is still completed (the header counts it), and the timer is still running.
    await expect(page.locator("header p").first()).toContainText(before.split("·")[1]!.trim());
    await expect(restBar(page)).toBeVisible();
  });
});
