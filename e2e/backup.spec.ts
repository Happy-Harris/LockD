import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog, readLog } from "./helpers";

test.describe("restoring a backup", () => {
  test("refuses a file that is not a backup, and says why", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/settings");
    await page.getByTestId("backup-merge-input").setInputFiles({
      name: "notes.json",
      mimeType: "application/json",
      buffer: Buffer.from("this is not json {"),
    });
    await expect(page.getByTestId("backup-problems")).toContainText("not valid JSON");
    expect((await readLog(page)).workouts.length).toBeGreaterThan(100); // nothing changed
  });

  test("refuses a backup with a bad value, and points at it", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/settings");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON backup" }).click();
    const backup = JSON.parse(
      await (
        await (await download).createReadStream()
      )
        .toArray()
        .then((chunks) => Buffer.concat(chunks).toString("utf8")),
    );
    backup.workoutSets[0].reps = "five";
    await page.getByTestId("backup-replace-input").setInputFiles({
      name: "edited.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.getByTestId("backup-problems")).toContainText("workoutSets[0].reps");
    expect((await readLog(page)).workouts.length).toBeGreaterThan(100);
  });

  test("adds a backup without duplicating, and replaces after taking a safety copy", async ({
    page,
  }) => {
    await openWithSampleLog(page);
    await goTo(page, "/settings");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON backup" }).click();
    const file = await (await download).path();
    const before = (await readLog(page)).workouts.length;

    // Adding the log to itself changes nothing.
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByTestId("backup-merge-input").setInputFiles(file);
    await expect(
      page.getByText("Nothing new: every session in the backup is already in your log."),
    ).toBeVisible();
    expect((await readLog(page)).workouts).toHaveLength(before);

    // Replacing asks first, and a copy of the current log is kept.
    const dialogs: string[] = [];
    page.once("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.accept();
    });
    await page.getByTestId("backup-replace-input").setInputFiles(file);
    await expect(
      page.getByText(/Replaced your log with the backup: \d+ sessions?\./),
    ).toBeVisible();
    expect(dialogs[0]).toMatch(/Replace your whole log with this backup/);
    expect((await readLog(page)).workouts).toHaveLength(before);
    await expect(page.getByTestId("safety-backups")).toContainText("Before a restore");
  });

  test("declining the question changes nothing", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/settings");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON backup" }).click();
    const file = await (await download).path();
    page.once("dialog", (dialog) => void dialog.dismiss());
    await page.getByTestId("backup-replace-input").setInputFiles(file);
    await expect(page.getByTestId("safety-backups")).toContainText("None yet");
  });
});
