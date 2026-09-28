import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog, waitForApp } from "./helpers";

test.describe("critical fixes", () => {
  test("I-4: a guest can't trigger a Lab model call", async ({ page }) => {
    await openWithSampleLog(page);
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(request.url());
    });
    await goTo(page, "/lab");
    await expect(page.getByTestId("lab-guest-note")).toContainText("Sign in");
    await expect(page.getByRole("button", { name: /Ask the Lab|Ask again/i })).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(posts).toEqual([]);
  });

  test("I-1: the Train tab and a routine open without crashing", async ({ page }) => {
    const crashes: string[] = [];
    page.on("console", (message) => {
      if (/Maximum update depth/.test(message.text())) crashes.push(message.text());
    });
    await openWithSampleLog(page);
    await goTo(page, "/routines");
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await expect(page.getByText("Push Day").first()).toBeVisible();
    await page.getByText("Push Day").first().click();
    await expect(page).toHaveURL(/\/routines\/.+/);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    expect(crashes).toEqual([]);
  });

  test("I-3: discarding a workout asks first", async ({ page }) => {
    await openWithSampleLog(page);
    await page.getByRole("button", { name: /Repeat last/i }).click();
    await expect(page).toHaveURL(/\/workout$/);
    await waitForApp(page);

    await page.getByRole("button", { name: "Discard" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Keep logging" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/workout$/);
    await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();

    await page.getByRole("button", { name: "Discard" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Discard session" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("I-3: a deleted set can be undone", async ({ page }) => {
    await openWithSampleLog(page);
    await page.getByRole("button", { name: /Repeat last/i }).click();
    await waitForApp(page);
    const completeButtons = page.getByRole("button", { name: "Complete set" });
    await expect(completeButtons.first()).toBeVisible();
    const before = await completeButtons.count();

    await completeButtons.first().click({ button: "right" });
    await expect(completeButtons).toHaveCount(before - 1);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(completeButtons).toHaveCount(before);
  });

  test("I-2: Settings lists safety copies and offers each for download", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/settings");
    const section = page.getByTestId("safety-backups");
    await expect(section).toContainText("None yet");

    // Take a copy through the real module (the dev server serves source modules).
    await page.evaluate(async () => {
      const safety = await import("/src/lib/storage/safety.ts");
      const state = JSON.parse(localStorage.getItem("lockd-v1") || "{}").state;
      await safety.takeSafetyBackup("before-cloud-sign-in", {
        format: "lockd-backup",
        version: 3,
        exportedAt: new Date().toISOString(),
        ...state,
      });
    });
    await page.reload();
    await expect(section).toContainText("Before signing in");
    const download = page.waitForEvent("download");
    await section.getByRole("button", { name: "Download" }).click();
    expect((await download).suggestedFilename()).toMatch(/^lockd-safety-copy-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
