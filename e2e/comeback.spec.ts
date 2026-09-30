import { expect, test, type Page } from "@playwright/test";
import { waitForApp, waitForSessions } from "./helpers";

/** A date `days` before today, as the CSV writes it. */
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const csv = (rows: Array<[days: number, kg: number]>) =>
  [
    "Date,Workout Name,Exercise Name,Set Order,Weight (kg),Reps",
    ...rows.map(([days, kg]) => `${daysAgo(days)} 10:00:00,Upper,Bench Press (Barbell),1,${kg},5`),
  ].join("\n");

async function importLog(page: Page, text: string, sessions: number) {
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
  await waitForSessions(page, sessions);
}

test.describe("comeback mode (Opp 8)", () => {
  test("away: Today says how long, and each lift restarts by the stated rule, which Settings can change", async ({
    page,
  }) => {
    await importLog(page, csv([[60, 95], [57, 97.5], [54, 100], [45, 100]]), 4);
    await page.goto("/");
    await waitForApp(page);

    const card = page.getByTestId("comeback-card");
    await expect(card).toContainText("45 days since your last session");
    // 45 days away is the 28 to 55 band: 80 % of 100 kg.
    await expect(page.getByTestId("comeback-restarts")).toContainText("Bench Press 80 kg × 5, from 100 kg");
    await expect(card).toContainText("Rule, not a prediction");

    await card.getByRole("link", { name: "Change it in Settings" }).click();
    await expect(page).toHaveURL(/\/settings/);
    await page.getByTestId("comeback-midPct").selectOption("70");

    await page.goto("/");
    await waitForApp(page);
    await expect(page.getByTestId("comeback-restarts")).toContainText("Bench Press 70 kg × 5");
    await expect(page.getByTestId("comeback-card")).toContainText("70% after 28 to 55");
  });

  test("back: Today counts the records set since the return", async ({ page }) => {
    await importLog(page, csv([[90, 95], [87, 97.5], [84, 100], [12, 85], [8, 90], [4, 102.5]]), 6);
    await page.goto("/");
    await waitForApp(page);

    const card = page.getByTestId("comeback-card");
    await expect(card).toContainText("after 72 days away");
    await expect(page.getByTestId("comeback-prs")).toContainText("1 estimated-1RM record since then: Bench Press");
    // Back and training: no restart targets.
    await expect(page.getByTestId("comeback-restarts")).toHaveCount(0);
  });

  test("no layoff, no card", async ({ page }) => {
    await importLog(page, csv([[9, 95], [6, 97.5], [3, 100]]), 3);
    await page.goto("/");
    await waitForApp(page);
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
    await expect(page.getByTestId("comeback-card")).toHaveCount(0);
  });
});
