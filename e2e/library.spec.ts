import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog, readLog } from "./helpers";

test.describe("the exercise library", () => {
  test("a new install has the whole library, and it is stored", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/library");
    await expect(page.getByText("93 lifts")).toBeVisible();
    const log = await readLog(page);
    expect(log.exercises.filter((e) => !e.isCustom)).toHaveLength(93);
    expect(log.exercises.map((e) => e.id)).toContain("seed-rack-pull");
  });
});
