import { defineConfig } from "@playwright/test";

const PORT = 8080;
/** Reuse a preinstalled Chromium locally (CHROMIUM_PATH); CI installs a matching browser. */
const executablePath = process.env.CHROMIUM_PATH;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "phone",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, launchOptions },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1024, height: 768 }, launchOptions },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Sign-in on, with placeholder values that never reach a provider: the specs see the signed-out
    // prompts a real deployment shows. Apple is left off so a partial setup is covered too.
    env: {
      BETTER_AUTH_SECRET: "e2e-placeholder-not-a-secret",
      GOOGLE_CLIENT_ID: "e2e-placeholder",
      GOOGLE_CLIENT_SECRET: "e2e-placeholder",
      RESEND_API_KEY: "e2e-placeholder",
      AUTH_EMAIL_FROM: "Lockd <e2e@example.com>",
    },
  },
});
