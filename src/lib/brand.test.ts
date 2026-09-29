import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND, FONTS } from "./brand";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const css = read("src/styles.css");

/** The `--rf-*` variables declared in one `:root` block of styles.css. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/--rf-([\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1]!,
      m[2]!.trim().toLowerCase(),
    ]),
  );
}
const dark = tokens(":root");
const light = tokens(':root[data-theme="light"]');

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
const lower = (hex: string) => hex.toLowerCase();

describe("the palette has one definition", () => {
  it("styles.css uses the brand values", () => {
    expect(dark.canvas).toBe(lower(BRAND.mill));
    expect(dark.accent).toBe(lower(BRAND.oxide));
    expect(dark["accent-ink"]).toBe(lower(BRAND.mill));
    expect(dark.subtle).toBe(lower(BRAND.steel));
    expect(dark.success).toBe(lower(BRAND.verdigris));
    expect(dark.paper).toBe(lower(BRAND.chalk));
    expect(dark["paper-ink"]).toBe(lower(BRAND.ink));
    expect(dark["chart-1"]).toBe(lower(BRAND.oxide));
    expect(light.accent).toBe(lower(BRAND.oxideOnLight));
    expect(light["chart-1"]).toBe(lower(BRAND.oxideOnLight));
  });

  it("the accent themes are gone, and the old vermillion appears nowhere", () => {
    expect(css).not.toContain("data-accent");
    for (const file of [
      "src/styles.css",
      "public/manifest.webmanifest",
      "public/favicon.svg",
      "src/lib/og/site.json",
      "src/routes/__root.tsx",
    ]) {
      expect(read(file).toLowerCase(), file).not.toContain("c24a32");
      expect(read(file).toLowerCase(), file).not.toContain("0c0b0a");
    }
  });

  it("the manifest, favicon, OG card and page theme-color match", () => {
    const manifest = JSON.parse(read("public/manifest.webmanifest"));
    expect(manifest.background_color).toBe(BRAND.mill);
    expect(manifest.theme_color).toBe(BRAND.mill);
    expect(read("public/favicon.svg")).toContain(BRAND.oxide);
    expect(read("public/favicon.svg")).toContain(BRAND.mill);
    expect(JSON.parse(read("src/lib/og/site.json")).color).toBe(BRAND.oxide.slice(1));
    expect(read("src/routes/__root.tsx")).toContain(`content: "${BRAND.mill}"`);
  });
});

describe("contrast (plan O3: check Oxide on Mill for small text)", () => {
  const AA = 4.5;
  const surfaces = (theme: Record<string, string>) => [
    theme.canvas!,
    theme.surface!,
    theme.raised!,
  ];

  it("dark: Oxide text passes AA on the page; button text on Oxide passes AA", () => {
    expect(contrast(dark.accent!, dark.canvas!)).toBeGreaterThanOrEqual(AA);
    expect(contrast(dark["accent-ink"]!, dark.accent!)).toBeGreaterThanOrEqual(AA);
  });

  it("dark: quiet and body text pass AA on every surface", () => {
    for (const surface of surfaces(dark)) {
      expect(contrast(dark.subtle!, surface)).toBeGreaterThanOrEqual(AA);
      expect(contrast(dark.muted!, surface)).toBeGreaterThanOrEqual(AA);
      expect(contrast(dark.ink!, surface)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("dark: Oxide on the card surfaces is for large text and controls (3:1), not small text", () => {
    // Known limit, recorded so nobody reads it as AA: small Oxide text on cards is under 4.5:1,
    // but better than the vermillion it replaces.
    for (const surface of [dark.surface!, dark.raised!]) {
      expect(contrast(dark.accent!, surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(dark.accent!, surface)).toBeLessThan(AA);
    }
  });

  it("light: the darkened Oxide passes AA on every light surface, and so does button text on it", () => {
    for (const surface of [...surfaces(light), BRAND.chalk]) {
      expect(contrast(light.accent!, surface)).toBeGreaterThanOrEqual(AA);
    }
    expect(contrast(light["accent-ink"]!, light.accent!)).toBeGreaterThanOrEqual(AA);
  });

  it("plain Oxide on Chalk is under AA, which is why the light theme uses the darker one", () => {
    expect(contrast(BRAND.oxide, BRAND.chalk)).toBeLessThan(AA);
  });

  it("printed surfaces: Mill ink on Chalk passes AA", () => {
    expect(contrast(BRAND.ink, BRAND.chalk)).toBeGreaterThanOrEqual(AA);
  });
});

describe("the typefaces", () => {
  const fontsCss = read("src/fonts.css");

  it("styles.css and the brand module name the same families", () => {
    const theme = css.slice(css.indexOf("@theme"), css.indexOf("}", css.indexOf("@theme")));
    expect(theme).toContain(`--font-sans: ${FONTS.sans},`);
    expect(theme).toContain(`--font-display: ${FONTS.display},`);
    expect(theme).toContain(`--font-mono: ${FONTS.mono},`);
  });

  it("every face is declared, and every file it points at exists in node_modules", () => {
    for (const family of [FONTS.display, FONTS.sans, FONTS.mono]) {
      expect(fontsCss, family).toContain(`font-family: ${family};`);
    }
    const files = [...fontsCss.matchAll(/url\("\.\.\/(node_modules\/[^"]+)"\)/g)].map((m) => m[1]!);
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files) {
      expect(existsSync(new URL(`../../${file}`, import.meta.url)), file).toBe(true);
    }
  });

  it("the old faces are gone from the styles, the canvas code and the dependencies", () => {
    for (const file of [
      "src/styles.css",
      "src/fonts.css",
      "src/components/app/receipt.tsx",
      "src/components/app/moment-poster.tsx",
      "src/components/app/rest-timer.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/Barlow/);
    }
    const pkg = read("package.json");
    expect(pkg).not.toContain("@fontsource/barlow");
    expect(pkg).toContain("@fontsource/big-shoulders-display");
    expect(pkg).toContain("@fontsource-variable/archivo");
  });

  it("canvas text is drawn with the brand's family names", () => {
    for (const file of [
      "src/components/app/receipt.tsx",
      "src/components/app/moment-poster.tsx",
      "src/components/app/rest-timer.tsx",
    ]) {
      const source = read(file);
      expect(source, file).toContain("FONTS.");
      expect(source, file).not.toMatch(/ctx\.font = "/);
    }
  });

  it("the licence text ships with the fonts", () => {
    const licences = read("public/font-licences.txt");
    for (const name of ["Big Shoulders Display", "Archivo", "IBM Plex Mono"]) {
      expect(licences, name).toContain(name);
    }
    expect(licences.match(/SIL OPEN FONT LICENSE Version 1\.1/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
