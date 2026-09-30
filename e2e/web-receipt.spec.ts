import { expect, test, type Request } from "@playwright/test";
import { readLog, waitForApp, waitForSessions } from "./helpers";

/** Three sessions in January, a 32-day gap, then three more: two eras, one layoff. */
const dates = ["2026-01-05", "2026-01-08", "2026-01-12", "2026-02-13", "2026-02-16", "2026-02-19"];
const MARKER = "Receipt Marker Press";
const STRONG = [
  "Date,Workout Name,Exercise Name,Set Order,Weight (kg),Reps",
  ...dates.flatMap((date, i) => [
    `${date} 10:00:00,Full Body,Bench Press (Barbell),1,${80 + i * 2.5},5`,
    `${date} 10:00:00,Full Body,${MARKER},1,40,8`,
  ]),
].join("\n");

const strongFile = (text = STRONG) => ({
  name: "strong.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(text),
});

test.describe("web receipt, no account (Opp 2)", () => {
  test("a visitor reads their export on the device, then carries it into Lock'd", async ({ page }) => {
    // Everything the page sends while the file is open: nothing may carry it.
    const sent: Request[] = [];
    page.on("request", (request) => sent.push(request));

    await page.goto("/receipt");
    await waitForApp(page);
    await page.getByTestId("receipt-file").setInputFiles(strongFile());

    const receipt = page.getByTestId("web-receipt");
    await expect(receipt).toContainText("Training receipt 2026");
    await expect(page.getByTestId("receipt-source")).toContainText("Read as a Strong CSV. Weights in kg");
    await expect(page.getByTestId("web-receipt-span")).toContainText("2 eras");
    await expect(receipt).toContainText("2026 Return");
    await expect(receipt).toContainText("Foundation");
    await expect(page.getByTestId("web-receipt-lifts")).toContainText("from 92.5 kg × 5 on");

    // Nothing was uploaded: no request carried a body, and none mentions the file's contents.
    for (const request of sent) {
      expect(request.method(), request.url()).toBe("GET");
      expect(request.postData() ?? "").toBe("");
      expect(request.url()).not.toContain("Receipt%20Marker");
      expect(request.url()).not.toContain(MARKER);
    }
    // Sharing a link needs an account (Opp 9): signed out, the page offers sign-in and nothing that publishes.
    await expect(page.getByRole("button", { name: /Share a link/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in to share a link" })).toBeVisible();
    // Nor was anything saved: the browser's own log is still empty.
    expect((await readLog(page)).workouts).toHaveLength(0);

    await page.getByTestId("receipt-continue").click();
    await expect(page).toHaveURL(/\/chronicle$/);
    await waitForSessions(page, dates.length);
    expect((await readLog(page)).workouts).toHaveLength(dates.length);
    await expect(page.getByText("2026 Return").first()).toBeVisible();
  });

  test("a file that does not say kg or lb asks, and the numbers follow the answer", async ({ page }) => {
    const unitless = [
      "Date,Workout Name,Exercise Name,Set Order,Weight,Reps",
      "2026-01-05 10:00:00,Day,Bench Press (Barbell),1,225,5",
    ].join("\n");
    await page.goto("/receipt");
    await waitForApp(page);
    await page.getByTestId("receipt-file").setInputFiles(strongFile(unitless));
    await expect(page.getByTestId("web-receipt-lifts")).toContainText("from 225 kg × 5");
    await page.getByTestId("receipt-unit-lb").click();
    await expect(page.getByTestId("web-receipt-lifts")).toContainText("from 225 lb × 5");
  });

  test("a file with no sessions says so, and where to go instead", async ({ page }) => {
    await page.goto("/receipt");
    await waitForApp(page);
    await page.getByTestId("receipt-file").setInputFiles(strongFile("name,colour\nbench,red"));
    await expect(page.getByTestId("receipt-problems")).toContainText("choose the columns");
    await expect(page.getByTestId("web-receipt")).toHaveCount(0);
  });

  test("the page is public and carries its own share card", async ({ request }) => {
    const html = await (await request.get("/receipt")).text();
    expect(html).toContain("Your training receipt · Lock’d");
    expect(html).toContain("/receipt");
  });
});
