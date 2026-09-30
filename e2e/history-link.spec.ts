import { expect, test } from "@playwright/test";

/**
 * Opp 9: a read-only history link. Creating one needs sign-in, which this environment has no keys for, so the
 * owner's side is covered by `history-links.api.test.ts` against the real migrations. Here: what a stranger with a
 * wrong or revoked token gets, and that the page keeps itself out of search and out of Referer headers.
 */
const tag = (html: string, key: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)="${key}"[^>]+content="([^"]*)"`))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${key}"`))?.[1];

const token = "A".repeat(43);

test.describe("read-only history link (Opp 9)", () => {
  test("an unknown token says so, confirms nothing, and never echoes the token into the card", async ({ request }) => {
    const html = await (await request.get(`/h/${token}`)).text();
    expect(tag(html, "og:title")).toBe("Lock’d");
    expect(tag(html, "robots")).toBe("noindex, nofollow");
    expect(tag(html, "referrer")).toBe("no-referrer");
    expect(tag(html, "og:url")).not.toContain(token);
  });

  test("the page opens without an account and does not ask anyone to sign in", async ({ page }) => {
    await page.goto(`/h/${token}`);
    await expect(page.getByTestId("history-missing")).toContainText("doesn’t open a training log");
    await expect(page.getByText("Sign in")).toHaveCount(0);
  });

  test("a malformed token gets the same page", async ({ page }) => {
    await page.goto("/h/not-a-token");
    await expect(page.getByTestId("history-missing")).toContainText("doesn’t open a training log");
  });
});
