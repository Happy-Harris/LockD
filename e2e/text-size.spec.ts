import { expect, test, type Page } from "@playwright/test";
import { goTo, openWithSampleLog } from "./helpers";

/** Text size, step A (owner's spec, Appendix A): the control, no flash on a cold start, and Large at 320 px. */

const fontPx = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

/** The elements wider than the screen (empty when nothing scrolls sideways), so a failure names what overflowed. */
const overflowing = (page: Page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    // One pixel of slack: a chart can size itself to a fraction, which is not a sideways scroll a lifter can feel.
    if (document.documentElement.scrollWidth <= width + 1) return [] as string[];
    return [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > width + 1.5)
      .slice(0, 6)
      .map((el) => `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 90)}"> right=${Math.round(el.getBoundingClientRect().right)} "${(el.textContent ?? "").trim().slice(0, 40)}"`);
  });

const noSideScroll = async (page: Page) => (await overflowing(page)).length === 0;

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
      await expect.poll(() => overflowing(page), { message: path, timeout: 10_000 }).toEqual([]);
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
