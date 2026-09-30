import { expect, test } from "@playwright/test";
import { readLog, waitForApp, waitForSessions } from "./helpers";

/** Three sessions in January, a 32-day gap, then three more: two eras, one layoff, and a bench that climbs each time. */
const dates = ["2026-01-05", "2026-01-08", "2026-01-12", "2026-02-13", "2026-02-16", "2026-02-19"];
const STRONG = [
  "Date,Workout Name,Exercise Name,Set Order,Weight (kg),Reps",
  ...dates.flatMap((date, i) => [
    `${date} 10:00:00,Full Body,Bench Press (Barbell),1,${80 + i * 2.5},5`,
    `${date} 10:00:00,Full Body,Bench Press (Barbell),2,${80 + i * 2.5},5`,
  ]),
].join("\n");

test.describe("import-first onboarding (Opp 1)", () => {
  test("a new lifter imports their history and lands on the Chronicle it built", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForApp(page);
    await page.getByTestId("onboarding-import").click();
    await expect(page).toHaveURL(/\/import$/);

    await page.getByTestId("import-kind-strong").click();
    await page
      .getByTestId("import-file")
      .setInputFiles({ name: "strong.csv", mimeType: "text/csv", buffer: Buffer.from(STRONG) });
    await page.getByTestId("import-next-sessions").click();
    await page.getByTestId("import-next-resolve").click();
    await page.getByTestId("import-next-confirm").click();
    await page.getByTestId("import-run").click();
    await waitForSessions(page, dates.length);
    // Nothing but the file: no sample log came with it.
    expect((await readLog(page)).workouts).toHaveLength(dates.length);

    const card = page.getByTestId("import-chronicle");
    await expect(card).toContainText("2 eras");
    await expect(page.getByTestId("import-chronicle-summary")).toContainText(
      "6 sessions in your log, 1 layoff and 1 PR run.",
    );
    await expect(card).toContainText("Foundation");
    await expect(card).toContainText("The Return");

    await page.getByTestId("import-open-chronicle").click();
    await expect(page).toHaveURL(/\/chronicle$/);
    await expect(page.getByRole("heading", { name: "The lifting life." })).toBeVisible();
  });
});
