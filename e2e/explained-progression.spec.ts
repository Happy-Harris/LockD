import { expect, test } from "@playwright/test";
import { waitForApp, waitForSessions } from "./helpers";

/** A date `days` before today, as the CSV writes it. */
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

test.describe("explained progression (Opp 3)", () => {
  test("a next target lists the sessions it read, and each one opens that session", async ({ page }) => {
    const text = [
      "Date,Workout Name,Exercise Name,Set Order,Weight (kg),Reps",
      ...[9, 6, 3].map((days) => `${daysAgo(days)} 10:00:00,Upper,Bench Press (Barbell),1,100,5`),
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

    await page.goto("/");
    await waitForApp(page);
    const cited = page.getByTestId("cited-sessions").first();
    await expect(cited).toBeVisible();
    const links = cited.getByRole("link", { name: /Open the Bench Press session on/ });
    expect(await links.count()).toBeGreaterThan(0);
    await links.last().click();
    await expect(page).toHaveURL(/\/history\/[^/]+$/);
    await expect(page.getByText("Bench Press").first()).toBeVisible();
  });
});
