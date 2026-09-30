import { describe, expect, it } from "vitest";
import { absoluteUrl, lockerOg, ogMeta, shareOg, siteOg, SITE_DESCRIPTION } from "./tags";

const value = (tags: Array<Record<string, string>>, key: string) =>
  tags.find((tag) => tag.property === key || tag.name === key)?.content;

describe("share-card tags (plan Step 12: the middleware's job, now the routes')", () => {
  it("builds absolute image and page URLs from the origin, with or without a trailing slash", () => {
    expect(absoluteUrl("https://lockd.example", "/og.png")).toBe("https://lockd.example/og.png");
    expect(absoluteUrl("https://lockd.example/", "s/abc")).toBe("https://lockd.example/s/abc");
    const tags = siteOg("https://lockd.example");
    expect(value(tags, "og:image")).toBe("https://lockd.example/og.png");
    expect(value(tags, "og:url")).toBe("https://lockd.example/");
    expect(value(tags, "twitter:image")).toBe("https://lockd.example/og.png");
  });

  it("carries the full set a crawler reads, sized for the 1200 x 630 card", () => {
    const tags = siteOg("https://lockd.example");
    for (const key of [
      "og:site_name",
      "og:type",
      "og:title",
      "og:description",
      "og:url",
      "og:image",
      "og:image:width",
      "og:image:height",
      "twitter:card",
      "twitter:title",
      "twitter:description",
      "twitter:image",
      "description",
    ]) {
      expect(value(tags, key), key).toBeTruthy();
    }
    expect(value(tags, "og:image:width")).toBe("1200");
    expect(value(tags, "og:image:height")).toBe("630");
    expect(value(tags, "twitter:card")).toBe("summary_large_image");
    expect(value(tags, "og:description")).toBe(SITE_DESCRIPTION);
  });

  it("with no known origin the URLs stay relative rather than pointing at another host", () => {
    expect(value(siteOg(""), "og:image")).toBe("/og.png");
  });

  it("a share card repeats only the share's own title and a line by kind, never its numbers", () => {
    const tags = shareOg("https://lockd.example", "0b7a", { title: "Push Day", kind: "receipt" });
    expect(value(tags, "og:title")).toBe("Push Day · Lock’d");
    expect(value(tags, "og:url")).toBe("https://lockd.example/s/0b7a");
    expect(value(tags, "og:description")).toBe("A session receipt, kept on Lock’d.");
    expect(JSON.stringify(tags)).not.toMatch(/kg|lb|\d+ sets/i);
  });

  it("a share that could not be loaded gets the site tags, not an error message", () => {
    const tags = shareOg("https://lockd.example", "gone", null);
    expect(value(tags, "og:title")).toBe("Lock’d");
    expect(value(tags, "og:url")).toBe("https://lockd.example/s/gone");
  });

  it("a public locker card uses the display name and handle the page shows, and not the bio", () => {
    const tags = lockerOg("https://lockd.example", "sam", { displayName: "Sam", handle: "sam" });
    expect(value(tags, "og:title")).toBe("Sam (@sam) · Lock’d");
    expect(value(tags, "og:description")).toContain("Sam’s public locker");
    expect(JSON.stringify(tags)).not.toContain("bio");
  });

  it("a private or missing locker gets the site tags: nothing about it is confirmed or leaked", () => {
    const tags = lockerOg("https://lockd.example", "sam", null);
    expect(value(tags, "og:title")).toBe("Lock’d");
    expect(JSON.stringify(tags)).not.toContain("Sam");
  });

  it("ogMeta sets the page title as well", () => {
    expect(ogMeta({ origin: "", path: "/", title: "T", description: "D" })[0]).toEqual({
      title: "T",
    });
  });
});
