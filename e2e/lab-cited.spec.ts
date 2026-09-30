import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog } from "./helpers";

test.describe("Lab, cited", () => {
  test("a strength answer links the sessions behind each lift's first and last estimate", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/lab");
    await page.getByRole("button", { name: "Getting stronger?" }).click();
    const answer = page.getByTestId("ask-lab-answer");
    await expect(answer).toContainText("Computed from your log");
    const row = answer.getByTestId("lab-strength-row").first();
    await expect(row).toContainText("sessions");
    await row.getByRole("link", { name: /session on/ }).last().click();
    await expect(page).toHaveURL(/\/history\/[^/]+$/);
  });

  test("a catalog answer says it comes from the catalog, not the log", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/lab");
    await page.getByLabel("Ask the Lab").fill("Why is the default 10–20 credited sets?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.getByTestId("ask-lab-answer")).toContainText("From the evidence catalog");
  });
});
