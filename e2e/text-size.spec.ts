import { expect, test, type Page } from "@playwright/test";
import { goTo, openWithSampleLog } from "./helpers";

/** Text size, step A (owner's spec, Appendix A): the control, no flash on a cold start, and Large at 320 px. */

const fontPx = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe("text size", () => {
  test("Large scales body text, keeps headings, and is applied before the app loads on a cold start", async ({ page }) => {
    await openWithSampleLog(page);
    await goTo(page, "/settings");
    const bodyBefore = await fontPx(page, "p.text-sm");
    const headingBefore = await fontPx(page, "h1");
    expect(bodyBefore).toBe(14);

    await page.getByTestId("text-size-control").getByRole("button", { name: "Large" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
    expect(await fontPx(page, "p.text-sm")).toBe(18);
    expect(await fontPx(page, "h1")).toBe(headingBefore);

    // A cold reload: the size is on <html> as soon as the document is parsed, before React hydrates.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        (window as unknown as { sizeAtParse: string | null }).sizeAtParse =
          document.documentElement.getAttribute("data-text-size");
      });
    });
    await goTo(page, "/settings");
    expect(await page.evaluate(() => (window as unknown as { sizeAtParse: string | null }).sizeAtParse)).toBe("large");
  });

  test("at Large and 320 px: no sideways scroll, tab labels on one line, the set row fits", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await openWithSampleLog(page);
    await goTo(page, "/settings");
    await page.getByTestId("text-size-control").getByRole("button", { name: "Large" }).click();

    for (const path of ["/", "/settings", "/analytics", "/chronicle", "/history", "/lab", "/more"]) {
      await goTo(page, path);
      // Charts size themselves after the first render: wait for the layout to settle, then require no sideways scroll.
      await expect.poll(() => noSideScroll(page), { message: path, timeout: 10_000 }).toBe(true);
    }

    const tabs = page.locator("nav a.text-tab");
    for (const tab of await tabs.all()) {
      const box = await tab.evaluate((el) => {
        const text = [...el.childNodes].find((n) => n.nodeType === 3);
        const range = document.createRange();
        range.selectNodeContents(text!);
        return range.getClientRects().length;
      });
      expect(box).toBe(1);
    }

    await goTo(page, "/");
    await page.getByRole("button", { name: /Repeat last/i }).click();
    const complete = page.getByRole("button", { name: "Complete set" }).first();
    await expect(complete).toBeVisible();
    await expect.poll(() => noSideScroll(page)).toBe(true);
    const box = await complete.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  });
});
