import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog, readLog, waitForSessions } from "./helpers";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../src/test/fixtures/strong/${name}`, import.meta.url)));

test.describe("importing a Strong CSV", () => {
  test("reads a European file correctly, and importing it again adds nothing", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/settings");
    const before = (await readLog(page)).workouts.length;
    const file = { name: "strong-euro.csv", mimeType: "text/csv", buffer: fixture("strong-euro.csv") };

    await page.getByTestId("strong-csv-input").setInputFiles(file);
    await expect(page.getByTestId("csv-note")).toContainText("Imported");
    await waitForSessions(page, before + 1);
    const after = await readLog(page);
    const added = after.workouts.filter((w) => w.importFingerprint);
    expect(added.length).toBeGreaterThan(0);
    expect(after.workouts.length).toBe(before + added.length);
    // Decimal commas were read as decimals: no imported set is missing its weight.
    const addedIds = new Set(added.map((w) => w.id));
    const sets = after.workoutSets.filter((s) => addedIds.has(s.workoutId));
    expect(sets.some((s) => s.weightG === undefined)).toBe(false);

    // The same file again: every session is recognised and left out.
    await page.getByTestId("strong-csv-input").setInputFiles(file);
    await expect(page.getByTestId("csv-note")).toContainText("Imported 0 sessions");
    await expect(page.getByTestId("csv-note")).toContainText("already here");
    expect((await readLog(page)).workouts).toHaveLength(before + added.length);
  });
});
