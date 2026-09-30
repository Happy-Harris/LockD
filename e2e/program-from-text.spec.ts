import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog } from "./helpers";

/** Program from text (Opp 11): the preview shows what was read and every line that was not; nothing saves before the button. */

const TEXT = `Push Pull Legs
Week 1
Day 1: Push
Bench Press 3x8-12 @ RPE 8 rest 90s
Overhead Press 3 x 8 @ 40 kg
Foam roll for a while
Day 2: Pull
Barbell Row 4 sets of 6
Cable Wobble Curl 3x12
Week 2: deload`;

test.describe("program from text", () => {
  test("shows what it read and what it left out, and saves only on the button", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/programs/from-text");
    await expect(page.getByTestId("program-text-empty")).toBeVisible();

    await page.getByTestId("program-text").fill(TEXT);
    const preview = page.getByTestId("program-preview");
    await expect(preview.getByRole("heading", { name: "Push Pull Legs" })).toBeVisible();
    await expect(preview).toContainText("2 weeks · 2 sessions · 4 exercises · deload week 2");
    await expect(preview).toContainText("Bench Press · 3 × 8–12 · RPE 8 · rest 90 s");
    await expect(preview).toContainText("Overhead Press · 3 × 8 · rest");
    await expect(preview).toContainText("Cable Wobble Curl");
    await expect(preview).toContainText("Not in your library yet");

    const unused = page.getByTestId("program-unused");
    await expect(unused.getByRole("heading")).toHaveText("2 lines not used");
    await expect(unused).toContainText("Line 5:");
    await expect(unused).toContainText("@ 40 kg");
    await expect(unused).toContainText("loads are not stored in a program");
    await expect(unused).toContainText("Foam roll for a while");
    await expect(unused).toContainText("no sets and reps found");

    const filled = page.getByTestId("program-filled-in");
    await expect(filled).toContainText("Rest between sets");
    await expect(filled).toContainText("Progression: double progression");
    await expect(filled).toContainText("Warm-up sets: on");

    // Nothing is written until Save: leave, and the program is not in the list.
    await page.getByRole("link", { name: "← Programs" }).click();
    await expect(page.getByRole("heading", { name: "Programs", level: 1 })).toBeVisible();
    await expect(page.getByText("Push Pull Legs")).toHaveCount(0);

    await page.getByRole("link", { name: "Paste a program" }).click();
    await page.getByTestId("program-text").fill(TEXT);
    await page.getByTestId("program-save").click();
    await expect(page).toHaveURL(/\/programs\/[^/]+$/);
    await expect(page.getByText("Push Pull Legs").first()).toBeVisible();
  });

  test("a near name is only suggested, and a tap links it", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/programs/from-text");
    await page.getByTestId("program-text").fill("Day 1\nBench Press - Close Grip 3x8");
    const candidates = page.getByTestId("program-candidates");
    await expect(candidates).toContainText("Might be an exercise you have");
    await expect(page.getByTestId("program-preview")).toContainText("Not in your library yet");
    await candidates.getByRole("button", { name: "Same exercise" }).click();
    await expect(page.getByTestId("program-preview")).toContainText("In your library as");
  });
});
