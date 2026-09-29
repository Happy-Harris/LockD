import { expect, test, type Page } from "@playwright/test";
import { goTo, openWithSampleLog, readLog, waitForApp } from "./helpers";

/** Ids from the saved sample log, so the test visits real records. */
async function sampleIds(page: Page) {
  const state = await readLog(page);
  const completed = state.workouts.filter((w) => w.status === "completed");
  return {
    workoutId: completed.at(-1)!.id,
    workoutName: completed.at(-1)!.name,
    programId: state.programs[0]!.id,
    programName: state.programs[0]!.name,
    routineId: state.templates[0]!.id,
  };
}

test.describe("detail screens render themselves, not their list", () => {
  test("history, library, program, routine and tools detail", async ({ page }) => {
    await openWithSampleLog(page);
    const ids = await sampleIds(page);

    await goTo(page, `/history/${ids.workoutId}`);
    await expect(page.getByRole("heading", { level: 1, name: ids.workoutName })).toBeVisible();

    await goTo(page, "/library/seed-bench-press");
    await expect(page.getByRole("heading", { level: 1, name: "Bench Press" })).toBeVisible();

    await goTo(page, `/programs/${ids.programId}`);
    await expect(page.getByRole("heading", { level: 1, name: ids.programName })).toBeVisible();

    await goTo(page, `/routines/${ids.routineId}`);
    await expect(page.getByRole("button", { name: /Add exercise/i })).toBeVisible();

    await goTo(page, "/tools/plates");
    await expect(page.getByRole("heading", { level: 1, name: "Plates" })).toBeVisible();

    await goTo(page, "/tools/warmup");
    await expect(page.getByRole("heading", { level: 1, name: "Warm-up" })).toBeVisible();
  });

  test("finishing a workout lands on its summary", async ({ page }) => {
    await openWithSampleLog(page);
    await page.getByRole("button", { name: /Repeat last/i }).click();
    await expect(page).toHaveURL(/\/workout$/);
    await waitForApp(page);
    await page.getByRole("button", { name: "Complete set" }).first().click();
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page).toHaveURL(/\/workout\/.+\/summary$/);
    await expect(page.getByRole("heading", { level: 1, name: "Keep the receipt." })).toBeVisible();
  });
});
