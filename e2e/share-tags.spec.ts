import { expect, test } from "@playwright/test";

/**
 * The share-card tags are in the server-rendered HTML, the way a crawler reads it (no JavaScript run), and nothing
 * points at a third-party card service or script (plan Step 12: the app-builder middleware that did this is gone).
 */
const tag = (html: string, key: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)="${key}"[^>]+content="([^"]*)"`))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${key}"`))?.[1];

test.describe("share-card tags", () => {
  test("the home page carries the site card with absolute URLs on its own origin", async ({
    request,
    baseURL,
  }) => {
    const html = await (await request.get("/")).text();
    const origin = new URL(baseURL ?? "http://127.0.0.1:8080").origin;
    expect(tag(html, "og:title")).toBe("Lock’d");
    expect(tag(html, "og:image")).toBe(`${origin}/og.png`);
    expect(tag(html, "og:image:width")).toBe("1200");
    expect(tag(html, "twitter:card")).toBe("summary_large_image");
    expect(html).not.toContain("grok.com");
    expect(html).not.toContain("/__grok/");
  });

  test("the card image is served, and is the size the tags say", async ({ request }) => {
    const res = await request.get("/og.png");
    expect(res.ok()).toBe(true);
    expect(res.headers()["content-type"]).toContain("image/png");
    const body = await res.body();
    expect(body.readUInt32BE(16)).toBe(1200);
    expect(body.readUInt32BE(20)).toBe(630);
  });

  test("a share link that does not exist gets the site card, not an error or a guess", async ({
    request,
  }) => {
    const html = await (await request.get("/s/00000000-0000-4000-8000-000000000000")).text();
    expect(tag(html, "og:title")).toBe("Lock’d");
    expect(tag(html, "og:url")).toContain("/s/00000000-0000-4000-8000-000000000000");
    expect(tag(html, "robots")).toBe("noindex, nofollow");
  });

  test("a locker that is not public gets the site card and does not confirm it exists", async ({
    request,
  }) => {
    const html = await (await request.get("/u/nobody-here")).text();
    expect(tag(html, "og:title")).toBe("Lock’d");
    expect(html).not.toContain("nobody-here’s");
    expect(tag(html, "robots")).toBe("noindex, nofollow");
  });
});
