// Draws the app icons (public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png)
// from the mark's shape and the palette in src/lib/brand.ts, so they cannot drift from the app.
//
//   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/make-icons.mjs
//
// It also draws the share card (public/og.png, 1200 x 630) that the page tags point at (src/lib/og/tags.ts), with the two
// self-hosted faces embedded so it needs no network.
//
// The favicon (public/favicon.svg) is the same drawing at 16 x 16; brand.test.ts checks its colours.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const font = (path) => readFileSync(new URL(`../node_modules/${path}`, import.meta.url)).toString("base64");

const brand = readFileSync(new URL("../src/lib/brand.ts", import.meta.url), "utf8");
const colour = (name) => {
  const match = brand.match(new RegExp(`${name}:\\s*"(#[0-9A-Fa-f]{6})"`));
  if (!match) throw new Error(`no ${name} in src/lib/brand.ts`);
  return match[1];
};
const MILL = colour("mill");
const OXIDE = colour("oxide");

// The tile and the L, on a 512 grid (the favicon's 16 grid times 32).
const tile = `<rect x="32" y="32" width="448" height="448" rx="96" fill="${OXIDE}"/>
  <path d="M128 96h128v224h160v96H128z" fill="${MILL}"/>`;

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${MILL}"/>
  ${body}
</svg>`;

// A maskable icon keeps its art inside the central 80% (the platform crops the rest away).
const scaled = `<g transform="translate(256 256) scale(0.696) translate(-256 -256)">${tile}</g>`;

const icons = [
  { file: "icon-192.png", size: 192, body: tile },
  { file: "icon-512.png", size: 512, body: tile },
  { file: "icon-maskable-512.png", size: 512, body: scaled },
  { file: "apple-touch-icon.png", size: 180, body: tile },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
for (const { file, size, body } of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:${MILL}}svg{display:block;width:${size}px;height:${size}px}</style>${svg(body)}`,
  );
  writeFileSync(new URL(`../public/${file}`, import.meta.url), await page.screenshot({ type: "png" }));
  console.log(`public/${file} (${size} x ${size})`);
}
// The native icons: one 1024 square each, no transparency (the platform rounds it). The tile drawing is the one above.
const native = [
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
  "ios/App/LockdWatch/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png",
];
await page.setViewportSize({ width: 1024, height: 1024 });
await page.setContent(
  `<style>html,body{margin:0;background:${MILL}}svg{display:block;width:1024px;height:1024px}</style>${svg(tile)}`,
);
const nativePng = await page.screenshot({ type: "png" });
for (const file of native) {
  writeFileSync(new URL(`../${file}`, import.meta.url), nativePng);
  console.log(`${file} (1024 x 1024)`);
}
// The share card: the mark, the name, the line. Mill field, Oxide tile, Chalk type.
const CHALK = colour("chalk");
const STEEL = colour("steel");
const display = font("@fontsource/big-shoulders-display/files/big-shoulders-display-latin-800-normal.woff2");
const sans = font("@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2");
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<style>
  @font-face{font-family:"Big Shoulders Display";font-weight:800;src:url(data:font/woff2;base64,${display}) format("woff2")}
  @font-face{font-family:"Archivo";font-weight:100 900;src:url(data:font/woff2;base64,${sans}) format("woff2")}
  html,body{margin:0;width:1200px;height:630px;background:${MILL};color:${CHALK}}
  .card{box-sizing:border-box;width:1200px;height:630px;padding:88px 96px;display:flex;align-items:center;gap:72px}
  svg{width:288px;height:288px;flex:none}
  h1{margin:0;font:800 200px/0.9 "Big Shoulders Display";letter-spacing:-2px;text-transform:none}
  p{margin:28px 0 0;font:400 44px/1.2 "Archivo";color:${STEEL}}
</style><div class="card"><svg viewBox="0 0 512 512"><rect x="32" y="32" width="448" height="448" rx="96" fill="${OXIDE}"/><path d="M128 96h128v224h160v96H128z" fill="${MILL}"/></svg><div><h1>Lock’d</h1><p>Keep the receipt.</p></div></div>`);
await page.evaluate(() => document.fonts.ready);
writeFileSync(new URL("../public/og.png", import.meta.url), await page.screenshot({ type: "png" }));
console.log("public/og.png (1200 x 630)");
await browser.close();
