import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const BANNED = /\b(rep\s?forge|strong[\s-]?pro|certified|knurl|grok)\b/i;

const publicDir = path.resolve(__dirname, "../../../public");
const manifest = JSON.parse(
  fs.readFileSync(path.join(publicDir, "manifest.webmanifest"), "utf8"),
) as {
  name: string;
  short_name: string;
  description: string;
  id: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
};

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): [number, number] {
  const buffer = fs.readFileSync(file);
  expect(buffer.subarray(1, 4).toString("ascii")).toBe("PNG");
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

describe("the web app manifest", () => {
  it("is installable: name, standalone display, a start URL inside its scope", () => {
    expect(manifest.name).toBe("Lock’d");
    expect(manifest.short_name).toBe("Lock’d");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("lists icons that exist at the sizes they claim, including a maskable one", () => {
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of manifest.icons) {
      const file = path.join(publicDir, icon.src.replace(/^\//, ""));
      expect(fs.existsSync(file), icon.src).toBe(true);
      const [w, h] = pngSize(file);
      expect(`${w}x${h}`, icon.src).toBe(icon.sizes);
    }
  });

  it("ships the touch icon the root route links to", () => {
    expect(pngSize(path.join(publicDir, "apple-touch-icon.png"))).toEqual([180, 180]);
  });

  it("never names the former brands", () => {
    expect(BANNED.test(JSON.stringify(manifest))).toBe(false);
  });
});
