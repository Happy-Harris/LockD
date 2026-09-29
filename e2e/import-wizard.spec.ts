import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog, readLog, waitForSessions } from "./helpers";

const CSV = [
  "when,lift,kilos,count",
  "2026-03-01 10:00,Bench Press (Barbell),80,5",
  "2026-03-01 10:00,Bench Press - Close Grip,60,8",
  "2026-03-01 10:00,Zercher Squat,100,5",
  "2026-03-01 10:00,Mystery Move,20,10",
].join("\n");

test.describe("the import wizard", () => {
  test("maps columns, confirms a merge, imports, and classifies only what is accepted", async ({
    page,
  }) => {
    await openWithSampleLog(page);
    await goTo(page, "/import");
    const before = await readLog(page);

    await page.getByTestId("import-kind-csv").click();
    await page
      .getByTestId("import-file")
      .setInputFiles({ name: "mine.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });

    // Unfamiliar columns: nothing is guessed, and it cannot continue until they are chosen.
    await expect(page.getByTestId("import-map-missing")).toContainText("Date and time");
    await expect(page.getByTestId("import-next-sessions")).toBeDisabled();
    await page.locator("#map-date").selectOption({ label: "when" });
    await page.locator("#map-exerciseName").selectOption({ label: "lift" });
    await page.locator("#map-weight").selectOption({ label: "kilos" });
    await page.locator("#map-reps").selectOption({ label: "count" });
    await expect(page.getByTestId("import-map-ok")).toContainText("1 session found");
    await page.getByTestId("import-next-sessions").click();

    await expect(page.getByTestId("import-sessions")).toContainText("1 in the file");
    await page.getByTestId("import-next-resolve").click();

    // The near match is only a question: the default is to add it as new.
    await expect(page.getByTestId("import-resolve")).toContainText("Bench Press - Close Grip");
    await expect(page.getByTestId("import-resolve")).toContainText("Close-Grip Bench Press");
    await page.getByRole("button", { name: "Same exercise" }).click();
    await page.getByTestId("import-next-confirm").click();
    await expect(page.getByTestId("import-confirm")).toContainText("2 new exercises, 1 merged");
    // Nothing has been written yet.
    expect((await readLog(page)).workouts).toHaveLength(before.workouts.length);

    await page.getByTestId("import-run").click();
    await expect(page.getByTestId("import-summary")).toContainText("Imported 1 session, 4 sets");
    await waitForSessions(page, before.workouts.length + 1);
    const after = await readLog(page);
    const closeGrip = after.exercises.find((e) => e.name === "Close-Grip Bench Press")!;
    const blocks = after.workoutExercises.filter(
      (b) => b.exerciseNameSnapshot === "Close-Grip Bench Press",
    );
    expect(blocks.some((b) => b.exerciseId === closeGrip.id)).toBe(true);
    expect(after.exercises.some((e) => e.name === "Bench Press - Close Grip")).toBe(false);
    expect(after.exercises.find((e) => e.name === "Zercher Squat")?.primaryMuscleGroup).toBe(
      "unmapped",
    );

    // Bulk Classify: a suggestion is used only when asked for, and applied only on Apply.
    await expect(page.getByTestId("bulk-row-Zercher Squat")).toBeVisible();
    await expect(page.getByTestId("bulk-row-Mystery Move")).toBeVisible();
    await page.getByTestId("bulk-use-suggestions").click();
    await expect(page.getByTestId("bulk-apply")).toContainText("Apply to 1 exercise");
    expect(
      (await readLog(page)).exercises.find((e) => e.name === "Zercher Squat")?.primaryMuscleGroup,
    ).toBe("unmapped");
    await page.getByTestId("bulk-apply").click();
    await expect
      .poll(
        async () =>
          (await readLog(page)).exercises.find((e) => e.name === "Zercher Squat")
            ?.primaryMuscleGroup,
      )
      .toBe("quads");
    const classified = await readLog(page);
    const zercher = classified.exercises.find((e) => e.name === "Zercher Squat")!;
    expect(
      classified.workoutExercises
        .filter((b) => b.exerciseId === zercher.id)
        .map((b) => b.primaryMuscleGroupSnapshot),
    ).toEqual(["quads"]);
    // The one with no suggestion stays unmapped until someone chooses.
    expect(classified.exercises.find((e) => e.name === "Mystery Move")?.primaryMuscleGroup).toBe(
      "unmapped",
    );
    await expect(page.getByTestId("bulk-row-Mystery Move")).toBeVisible();
    await expect(page.getByTestId("bulk-row-Zercher Squat")).toHaveCount(0);
  });

  test("a backup: untick a session, import, and the next run marks it already here", async ({
    page,
  }) => {
    await openWithSampleLog(page);
    await goTo(page, "/import");
    const before = await readLog(page);
    const backup = readFileSync(
      fileURLToPath(
        new URL("../src/test/fixtures/repforge/repforge-backup-v1.json", import.meta.url),
      ),
    );
    const file = { name: "backup.json", mimeType: "application/json", buffer: backup };

    await page.getByTestId("import-kind-backup").click();
    await page.getByTestId("import-file").setInputFiles(file);
    await expect(page.getByTestId("import-sessions")).toContainText("2 in the file");
    await page.getByRole("checkbox", { name: "Push A on 2026-01-12" }).uncheck();
    await page.getByTestId("import-next-resolve").click();
    await page.getByTestId("import-next-confirm").click();
    await expect(page.getByTestId("import-confirm")).toContainText("1 session, 6 sets");
    await page.getByTestId("import-run").click();
    await expect(page.getByTestId("import-summary")).toContainText("Imported 1 session");
    await waitForSessions(page, before.workouts.length + 1);
    expect((await readLog(page)).workouts).toHaveLength(before.workouts.length + 1);

    // Again: the imported one is marked, and the one left out last time is the only one selected.
    await goTo(page, "/import");
    await page.getByTestId("import-kind-backup").click();
    await page.getByTestId("import-file").setInputFiles(file);
    await expect(page.getByTestId("import-sessions")).toContainText("1 already in your log");
    await expect(page.getByRole("checkbox", { name: "Push A on 2026-01-05" })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Push A on 2026-01-12" })).toBeChecked();
  });

  test("a file that is not a backup is refused with the reason, and nothing changes", async ({
    page,
  }) => {
    await openWithSampleLog(page);
    await goTo(page, "/import");
    const before = await readLog(page);
    await page.getByTestId("import-kind-backup").click();
    await page.getByTestId("import-file").setInputFiles({
      name: "notes.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"hello":"world"}'),
    });
    await expect(page.getByTestId("import-problems")).toContainText(
      "not a backup this app can read",
    );
    expect((await readLog(page)).workouts).toHaveLength(before.workouts.length);
  });
});
