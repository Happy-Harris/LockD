import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { goTo, readLog, waitForApp, waitForSessions } from "./helpers";

const fixture = (name: string) =>
  fs.readFileSync(
    fileURLToPath(new URL(`../src/test/fixtures/persist/${name}`, import.meta.url)),
    "utf8",
  );

/** Puts an old-format log in localStorage before the app's first load, once. */
async function seedOldLog(page: Page, raw: string) {
  await page.addInitScript((payload) => {
    if (!localStorage.getItem("__seeded")) {
      localStorage.setItem("lockd-v1", payload);
      localStorage.setItem("__seeded", "1");
    }
  }, raw);
}

const storedKey = (page: Page) => page.evaluate(() => localStorage.getItem("lockd-v1"));

test.describe("durable storage", () => {
  test("moves an existing log into the database and leaves the old copy untouched", async ({
    page,
  }) => {
    const raw = fixture("persist-v3-demo.json");
    await seedOldLog(page, raw);
    await page.goto("/");
    await waitForApp(page);
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
    await waitForSessions(page, 137);

    expect((await readLog(page)).workoutSets).toHaveLength(2560);
    expect(await storedKey(page)).toBe(raw); // byte-identical: the old copy is kept

    // Logging after the move goes to the database and never back to localStorage.
    await page.getByRole("button", { name: /Repeat last/i }).click();
    await expect(page).toHaveURL(/\/workout$/);
    await waitForApp(page);
    await waitForSessions(page, 138);
    expect(await storedKey(page)).toBe(raw);

    // The copy taken before the move is listed in Settings.
    await goTo(page, "/settings");
    const section = page.getByTestId("safety-backups");
    await expect(section).toContainText("Before the move to the new storage");
    await expect(section.getByRole("button", { name: "Restore" })).toBeVisible();
  });

  test("reads a 5-year log (800+ sessions, 15,000 sets) inside the plan's budget at 4x slower CPU", async ({
    page,
  }, testInfo) => {
    // Reading is CPU work, not layout, so one project is enough (and it takes about 40 s).
    test.skip(testInfo.project.name === "phone", "measured on the desktop project only");
    // The sample log copied six times: ~820 sessions and ~15,000 sets, about 6.6 MB as JSON. That is
    // past the ~5 MB localStorage limit, which is the reason for the move, so it is written to the
    // database directly rather than through the old key.
    const demo = JSON.parse(fixture("persist-v3-demo.json")).state;
    const big = { ...demo };
    for (const key of ["workouts", "workoutExercises", "workoutSets"]) big[key] = [...demo[key]];
    for (let copy = 1; copy < 6; copy += 1) {
      const id = (value: string) => `${value}-c${copy}`;
      for (const w of demo.workouts) big.workouts.push({ ...w, id: id(w.id) });
      for (const e of demo.workoutExercises) {
        big.workoutExercises.push({ ...e, id: id(e.id), workoutId: id(e.workoutId) });
      }
      for (const s of demo.workoutSets) {
        big.workoutSets.push({
          ...s,
          id: id(s.id),
          workoutId: id(s.workoutId),
          workoutExerciseId: id(s.workoutExerciseId),
        });
      }
    }

    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("button", { name: /Start empty/i }).click();
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
    await waitForSessions(page, 0);
    await page.evaluate(async (slice) => {
      const { DexieRepository } = await import("/src/lib/storage/dexie-repository.ts");
      const { migratePersisted } = await import("/src/lib/storage/persisted.ts");
      const { withFreshDefaults } = await import("/src/lib/storage/migration.ts");
      const { freshData } = await import("/src/lib/gym/store.ts");
      await new DexieRepository().replaceAll(
        withFreshDefaults(migratePersisted(slice, 3), freshData()),
      );
    }, big);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const times: number[] = [];
    for (let run = 0; run < 3; run += 1) {
      await page.reload();
      await waitForApp(page);
      times.push(Number(await page.locator("html").getAttribute("data-gym-boot-ms")));
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

    // Best of three: CI runners are noisy, and the budget is about what the code needs.
    const best = Math.min(...times);
    expect(best, `read times at 4x throttle: ${times.join(", ")} ms`).toBeGreaterThan(0);
    expect(best, `read times at 4x throttle: ${times.join(", ")} ms`).toBeLessThan(500);
    expect((await readLog(page)).workoutSets.length).toBeGreaterThan(15_000);
  });

  test("keeps an unreadable log and says so, instead of writing over it", async ({ page }) => {
    const raw = fixture("persist-corrupt.txt");
    await seedOldLog(page, raw);
    await page.goto("/");
    await waitForApp(page);
    await expect(page.getByTestId("storage-notice")).toContainText("couldn’t read the log");
    expect(await storedKey(page)).toBe(raw);

    await page.getByRole("button", { name: /Start empty/i }).click();
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
    await expect
      .poll(async () => (await readLog(page)).settings.onboardingCompletedAt)
      .toBeTruthy();
    expect(await storedKey(page)).toBe(raw);

    await goTo(page, "/settings");
    const section = page.getByTestId("safety-backups");
    await expect(section).toContainText("Before the move to the new storage");
    const download = page.waitForEvent("download");
    await section.getByRole("button", { name: "Download" }).click();
    expect((await download).suggestedFilename()).toMatch(/^lockd-raw-log-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test("Delete local cache removes the old copy and the safety copies too", async ({ page }) => {
    await seedOldLog(page, fixture("persist-v3-imperial-custom.json"));
    await page.goto("/");
    await waitForApp(page);
    await waitForSessions(page, 2);
    await goTo(page, "/settings");
    await expect(page.getByTestId("safety-backups")).toContainText(
      "Before the move to the new storage",
    );

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete local cache" }).click();

    await expect.poll(() => storedKey(page)).toBeNull();
    await expect.poll(async () => (await readLog(page)).workouts.length).toBe(0);
    await page.reload();
    await waitForApp(page);
    // Onboarding shows again: the log really was reset. (The URL stays on /settings.)
    await page.getByRole("button", { name: /Start empty/i }).click();
    await expect(page.getByTestId("safety-backups")).toContainText("None yet");
  });
});
