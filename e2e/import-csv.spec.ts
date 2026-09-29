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
    const file = {
      name: "strong-euro.csv",
      mimeType: "text/csv",
      buffer: fixture("strong-euro.csv"),
    };

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

test.describe("importing a Hevy CSV", () => {
  test("adds the sessions once, in the units the file says, and again adds nothing", async ({
    page,
  }) => {
    await openWithSampleLog(page);
    await goTo(page, "/settings");
    const before = (await readLog(page)).workouts.length;
    const hevy = readFileSync(
      fileURLToPath(
        new URL("../src/test/fixtures/hevy/hevy-synthetic-lb-miles.csv", import.meta.url),
      ),
    );
    const file = { name: "hevy.csv", mimeType: "text/csv", buffer: hevy };

    await page.getByTestId("hevy-csv-input").setInputFiles(file);
    await expect(page.getByTestId("csv-note")).toContainText("Imported 5 sessions, 71 sets");
    await waitForSessions(page, before + 5);
    const log = await readLog(page);
    // A pounds file read by a kilogram user: the file's own unit is used (110.2 lb, not 110.2 kg).
    const first = log.workoutSets.find((s) => s.weightG === 49_986);
    expect(first).toBeTruthy();
    expect(log.workouts.filter((w) => w.importFingerprint)).toHaveLength(5);

    await page.getByTestId("hevy-csv-input").setInputFiles(file);
    await expect(page.getByTestId("csv-note")).toContainText("Imported 0 sessions");
    await expect(page.getByTestId("csv-note")).toContainText("5 sessions already here");
    expect((await readLog(page)).workouts).toHaveLength(before + 5);
  });
});

test.describe("importing a backup from another app", () => {
  test("adds sessions, routines and measurements once; a bad file is refused with the reason", async ({
    page,
  }) => {
    await openWithSampleLog(page);
    await goTo(page, "/settings");
    const before = await readLog(page);
    const backup = readFileSync(
      fileURLToPath(
        new URL("../src/test/fixtures/repforge/repforge-backup-v1.json", import.meta.url),
      ),
    );
    const file = { name: "backup.json", mimeType: "application/json", buffer: backup };

    await page.getByTestId("other-backup-input").setInputFiles(file);
    await expect(page.getByTestId("csv-note")).toContainText(
      "Imported 2 sessions, 10 sets, 2 measurements",
    );
    await waitForSessions(page, before.workouts.length + 2);
    const after = await readLog(page);
    // The sample log already has a routine called Push Day, so the backup's is left out, not doubled.
    await expect(page.getByTestId("csv-note")).toContainText(
      "1 routine with the same name already here",
    );
    expect(after.templates).toHaveLength(before.templates.length);
    expect(after.measurements).toHaveLength(before.measurements.length + 2);
    // The other app's time-zone sign is flipped: +60 there is -60 here.
    expect(
      after.workouts.find((w) => w.startedAt === "2026-01-05T17:30:00.000Z")?.tzOffsetMinutes,
    ).toBe(-60);

    await page.getByTestId("other-backup-input").setInputFiles(file);
    await expect(page.getByTestId("csv-note")).toContainText("Imported 0 sessions");
    await expect(page.getByTestId("csv-note")).toContainText("2 sessions already here");
    expect((await readLog(page)).workouts).toHaveLength(before.workouts.length + 2);
    expect((await readLog(page)).templates).toHaveLength(after.templates.length);

    await page.getByTestId("other-backup-input").setInputFiles({
      name: "notes.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        '{"format":"repforge-backup","version":1,"data":{"workouts":[{"id":"x","name":"n","status":"completed","startedAt":"soon"}]}}',
      ),
    });
    await expect(page.getByTestId("backup-problems")).toContainText("data.workouts[0].startedAt");
    expect((await readLog(page)).workouts).toHaveLength(before.workouts.length + 2);
  });
});

test.describe("importing a vault from another app", () => {
  test("adds sessions once, keeps unsided girths unsided, and shows them on the Body screen", async ({
    page,
  }) => {
    await openWithSampleLog(page);
    await goTo(page, "/settings");
    const before = await readLog(page);
    const vault = readFileSync(
      fileURLToPath(new URL("../src/test/fixtures/knurl/knurl-vault-v1.json", import.meta.url)),
    );
    const file = { name: "vault.json", mimeType: "application/json", buffer: vault };

    await page.getByTestId("other-backup-input").setInputFiles(file);
    await expect(page.getByTestId("csv-note")).toContainText(
      "Imported 2 sessions, 9 sets, 1 routine, 4 measurements",
    );
    await waitForSessions(page, before.workouts.length + 2);
    const after = await readLog(page);
    const arms = after.measurements.find((m) => m.metric === "arms");
    expect(arms).toMatchObject({ value: 348, displayUnit: "cm" });
    // No sided row is created by the import. Compared against the count before, not a value: the sample log's own
    // (whole-millimetre) left arms can land on 348 too.
    const sided = (log: typeof after) =>
      log.measurements.filter((m) => m.metric === "arm_left").length;
    expect(sided(after)).toBe(sided(before));
    // Raw sign kept: -60 there is -60 here.
    expect(
      after.workouts.find((w) => w.startedAt === "2026-02-03T17:30:00.000Z")?.tzOffsetMinutes,
    ).toBe(-60);

    await page.getByTestId("other-backup-input").setInputFiles(file);
    await expect(page.getByTestId("csv-note")).toContainText("Imported 0 sessions");
    expect((await readLog(page)).workouts).toHaveLength(before.workouts.length + 2);

    await goTo(page, "/body");
    await expect(page.getByText("Arms (side not recorded)").first()).toBeAttached();
  });
});

test.describe("exporting and importing back", () => {
  test("the sets file the app writes is recognised, session for session, when imported again", async ({
    page,
  }) => {
    await openWithSampleLog(page);
    await goTo(page, "/settings");
    const before = await readLog(page);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download sets CSV" }).click();
    const file = await (await download).path();
    expect((await download).suggestedFilename()).toMatch(/^lockd-sets-\d{4}-\d{2}-\d{2}\.csv$/);

    await page.getByTestId("strong-csv-input").setInputFiles(file);
    await expect(page.getByTestId("csv-note")).toContainText("Imported 0 sessions");
    await expect(page.getByTestId("csv-note")).toContainText("already here and left out");
    expect((await readLog(page)).workouts).toHaveLength(before.workouts.length);
  });
});
