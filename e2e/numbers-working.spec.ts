import { expect, test } from "@playwright/test";
import { waitForApp, waitForSessions } from "./helpers";

/** A date `days` before today, as the CSV writes it. */
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

test.describe("numbers show their working (Opp 4)", () => {
  test("an e1RM opens its formula, the sets used, the sets left out and the trend", async ({ page }) => {
    const rows = [
      [9, 1, 95, 5],
      [6, 1, 97.5, 5],
      [3, 1, 100, 5],
      [3, 2, 60, 15],
    ];
    const text = [
      "Date,Workout Name,Exercise Name,Set Order,Weight (kg),Reps",
      ...rows.map(([days, order, kg, reps]) => `${daysAgo(days!)} 10:00:00,Upper,Bench Press (Barbell),${order},${kg},${reps}`),
    ].join("\n");
    await page.goto("/");
    await waitForApp(page);
    await page.getByTestId("onboarding-import").click();
    await page.getByTestId("import-kind-strong").click();
    await page
      .getByTestId("import-file")
      .setInputFiles({ name: "strong.csv", mimeType: "text/csv", buffer: Buffer.from(text) });
    await page.getByTestId("import-next-sessions").click();
    await page.getByTestId("import-next-resolve").click();
    await page.getByTestId("import-next-confirm").click();
    await page.getByTestId("import-run").click();
    await waitForSessions(page, 3);

    await page.goto("/analytics");
    await waitForApp(page);
    await page.getByRole("button", { name: /Bench Press latest estimated 1RM .* show the working/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toContainText("Bench Press: estimated 1RM");
    await expect(sheet).toContainText("Epley: weight × (1 + reps / 30)");
    // 100 kg × 5 by Epley is 116.7 kg; the 15-rep set is left out and says why.
    await expect(sheet).toContainText("From 100 kg × 5");
    await expect(sheet.getByTestId("number-receipt-excluded")).toContainText("over 12 reps");
    await expect(sheet).toContainText("Best before this session: 114 kg");
    await expect(sheet).toContainText("Session by session (3)");
    await sheet.getByRole("link", { name: /Open the Bench Press session on/ }).last().click();
    await expect(page).toHaveURL(/\/history\/[^/]+$/);
  });
});
