import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog, readLog, waitForApp } from "./helpers";

/**
 * Opp 10. The native plugin cannot run in a browser, so the reading is applied through the store the way the
 * plugin's result is; everything after that (storage, the Chronicle overlay, the receipts) is the real app.
 */
test.describe("health context (Opp 10)", () => {
  test("is absent on the web: no Settings section, no overlay until it is switched on", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/settings");
    await expect(page.getByRole("heading", { name: "Health context" })).toHaveCount(0);
    await goTo(page, "/chronicle");
    await expect(page.getByTestId("era-health")).toHaveCount(0);
  });

  test("readings show under the era with counts, medians and the samples behind them, and survive a reload", async ({
    page,
  }) => {
    await openWithSampleLog(page);
    await page.evaluate(async () => {
      const { useGym } = await import("/src/lib/gym/store.ts");
      const state = useGym.getState();
      const last = state.workouts.filter((w) => w.status === "completed").map((w) => w.localDate).sort().pop()!;
      const at = (back: number, time: string) => {
        const date = new Date(`${last}T12:00:00`);
        date.setDate(date.getDate() - back);
        const pad = (n: number) => String(n).padStart(2, "0");
        return new Date(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}`).toISOString();
      };
      state.importHealthReading(
        {
          bodyweight: [
            { sourceId: "bw-a", grams: 84_000, at: at(4, "07:00:00") },
            { sourceId: "bw-b", grams: 83_200, at: at(1, "07:00:00") },
          ],
          // Three nights, 7 h, 8 h and 7 h 30 min: the median is 7 h 30 min.
          sleep: [
            { startAt: at(4, "23:00:00"), endAt: at(3, "06:00:00"), asleepSeconds: 25_200 },
            { startAt: at(3, "22:30:00"), endAt: at(2, "06:30:00"), asleepSeconds: 28_800 },
            { startAt: at(2, "23:00:00"), endAt: at(1, "06:30:00"), asleepSeconds: 27_000 },
          ],
          // Two SDNN readings: too few for a median.
          hrv: [
            { sourceId: "hrv-a", method: "sdnn", milliseconds: 41, at: at(3, "06:10:00") },
            { sourceId: "hrv-b", method: "sdnn", milliseconds: 47, at: at(2, "06:10:00") },
          ],
        },
        "apple_health",
      );
      state.setHealthSettings({ overlays: true });
    });

    await goTo(page, "/chronicle");
    const overlay = page.getByTestId("era-health").first();
    await expect(overlay).toBeVisible();
    // The sample log already has typed bodyweights; the imported one is the latest in the era.
    await expect(overlay.getByTestId("era-health-bodyweight")).toContainText("83.2 kg on");
    await expect(overlay.getByTestId("era-health-sleep")).toContainText("3 nights on file, median 7 h 30 min");
    await expect(overlay.getByTestId("era-health-hrv-sdnn")).toContainText("2 readings on file, too few for a median (it needs 3)");
    // No SDNN/RMSSD mixing, and no score or advice anywhere on the card.
    await expect(overlay.getByTestId("era-health-hrv-rmssd")).toHaveCount(0);
    await expect(overlay).not.toContainText(/ready|readiness|recovery|score|good|bad/i);

    // The receipt lists the nights with their source.
    await overlay.getByTestId("era-health-sleep").locator("summary").click();
    await expect(overlay.getByTestId("era-health-sleep")).toContainText("Apple Health");

    // No sideways scroll on the phone.
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(wide).toBe(false);

    // It is stored: reload and read the database.
    await expect.poll(async () => (await readLog(page)).healthSamples.length).toBe(5);
    await page.reload();
    await waitForApp(page);
    await expect(page.getByTestId("era-health").first().getByTestId("era-health-sleep")).toContainText("3 nights");
  });

  test("missing data reads as missing, never zero", async ({ page }) => {
    await openWithSampleLog(page);
    await page.evaluate(async () => {
      const { useGym } = await import("/src/lib/gym/store.ts");
      useGym.getState().setHealthSettings({ overlays: true });
    });
    await goTo(page, "/chronicle");
    const overlay = page.getByTestId("era-health").first();
    await expect(overlay.getByTestId("era-health-sleep")).toContainText("No sleep data for this era.");
    await expect(overlay.getByTestId("era-health-hrv")).toContainText("No heart rate variability data for this era.");
  });
});
