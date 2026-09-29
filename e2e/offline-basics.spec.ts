import { expect, test } from "@playwright/test";
import { goTo, openWithSampleLog, waitForApp } from "./helpers";

test.describe("the app carries what it needs", () => {
  test("loads with no request to any other origin, and its fonts come from the app", async ({
    page,
  }) => {
    const foreign: string[] = [];
    const appOrigin = new URL(test.info().project.use.baseURL ?? "http://127.0.0.1:8080").origin;
    // The one known exception: a script the app-builder scaffolding injects into every page. It is
    // removed with the scaffolding (plan PR 12), and this test then loses the exemption. Anything
    // else from another origin, a font CDN included, fails.
    const scaffolding = "https://grok.com/grok-app-builder/extensions.js";
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.protocol.startsWith("http") &&
        url.origin !== appOrigin &&
        request.url() !== scaffolding
      ) {
        foreign.push(request.url());
      }
    });
    await openWithSampleLog(page);
    await goTo(page, "/settings");

    expect(foreign).toEqual([]);
    const faces = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts]
        .filter((face) => face.status === "loaded")
        .map((face) => `${face.family.replace(/"/g, "")} ${face.weight}`);
    });
    expect(faces.some((face) => face.startsWith("Barlow Condensed"))).toBe(true);
    expect(faces.some((face) => face.startsWith("Barlow "))).toBe(true);
  });

  test("links its own manifest and touch icon, and both are served", async ({ page, request }) => {
    await page.goto("/");
    await waitForApp(page);
    const manifest = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(manifest).toBe("/manifest.webmanifest");
    expect((await request.get("/manifest.webmanifest")).ok()).toBe(true);
    const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
    expect((await request.get(touch!)).ok()).toBe(true);
    expect(await page.locator('link[rel="manifest"]').count()).toBe(1);
  });

  test("moving between screens already opened works with no network", async ({ page, context }) => {
    // Client-side navigation asks the server who is signed in on every move. Offline that call
    // fails, and the app must carry on as a guest instead of showing an error. (Screens never
    // opened are not covered here: their code is only on the device once the service worker has
    // cached it.)
    await openWithSampleLog(page);
    await page
      .getByRole("link", { name: /^Train$/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/routines$/);
    await page
      .getByRole("link", { name: /^Today$/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();

    await context.setOffline(true);
    await page
      .getByRole("link", { name: /^Train$/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/routines$/);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await page
      .getByRole("link", { name: /^Today$/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await context.setOffline(false);
  });
});
