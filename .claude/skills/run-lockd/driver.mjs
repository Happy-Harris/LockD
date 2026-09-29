// Drives the running Lock'd app in headless Chromium and saves screenshots.
// Usage (from repo root, with `npm run dev` already listening on :8080):
//   CHROMIUM_PATH=/opt/pw-browsers/chromium node .claude/skills/run-lockd/driver.mjs [outDir] [route ...]
// No routes given → onboards with the sample log, then shoots the main screens at phone and desktop widths.
// FULL=1 saves the whole scrolled page instead of the first viewport.
// WORKOUT=bilateral|unilateral starts a workout first (the /workout route redirects to Today without one).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.env.BASE_URL ?? "http://127.0.0.1:8080";
const out = process.argv[2] ?? "/tmp/lockd-shots";
const routes = process.argv.slice(3);
const screens = routes.length ? routes : ["/", "/history", "/analytics", "/lab", "/settings"];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const sizes = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1024, height: 768 } },
};
for (const [name, opts] of Object.entries(sizes)) {
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`[${name}] pageerror:`, error.message));
  const ready = () => page.waitForSelector("html[data-gym-ready='true']", { state: "attached", timeout: 60_000 });
  await page.goto(base + "/");
  await ready();
  await page.getByRole("button", { name: /Open with a sample log/i }).click();
  await page.getByRole("heading", { name: "Today", level: 1 }).waitFor();
  // Writes to IndexedDB are asynchronous: navigating before they land shows onboarding again.
  await page.waitForFunction(async () => {
    const { DexieRepository } = await import("/src/lib/storage/dexie-repository.ts");
    return (await new DexieRepository().load()).workouts.length > 0;
  }, undefined, { timeout: 30_000 });
  if (process.env.WORKOUT) {
    // /workout only renders with an active workout, so start one the way a lifter does: "Repeat last"
    // on Today. WORKOUT=unilateral then adds a one-arm exercise through the picker, which logs left and right rows.
    await page.getByRole("button", { name: /Repeat last/i }).click();
    await page.getByRole("button", { name: "Complete set" }).first().waitFor();
    if (process.env.WORKOUT === "unilateral") {
      await page.getByRole("button", { name: "Add exercise" }).click();
      await page.getByPlaceholder("Search the library").fill("One-Arm Dumbbell Row");
      await page.getByRole("button", { name: /One-Arm Dumbbell Row/i }).first().click();
      await page.getByText("1L").first().waitFor();
    }
  }
  for (const route of screens) {
    // With a workout running, stay in the app: a full reload would only prove persistence, not the screen.
    if (!process.env.WORKOUT || route !== "/workout") await page.goto(base + route);
    await ready();
    const file = `${out}/${name}${route === "/" ? "-today" : route.replace(/\//g, "-")}.png`;
    await page.screenshot({ path: file, fullPage: process.env.FULL === "1" });
    console.log(file, "-", await page.title());
  }
  await context.close();
}
await browser.close();
