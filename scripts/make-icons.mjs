// Draws the app icons (public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png)
// from the mark's shape and the palette in src/lib/brand.ts, so they cannot drift from the app.
//
//   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/make-icons.mjs
//
// The favicon (public/favicon.svg) is the same drawing at 16 x 16; brand.test.ts checks its colours.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

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
await browser.close();
