import { expect, test } from "@playwright/test";
import { goTo, waitForApp } from "../e2e/helpers";
import { SECURITY_HEADERS } from "../src/lib/security/headers";

// Web readiness gap 4: the production build sends the security headers, and the app still works under its own
// content policy (any blocked script, style, font, image or connection shows up as a console error).
test("the production build sends the security headers and the app runs under them", async ({ page }) => {
  const refused: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy|Refused to/i.test(message.text())) {
      refused.push(message.text());
    }
  });

  const response = await page.goto("/");
  const headers = response!.headers();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    expect(headers[name.toLowerCase()], name).toBe(value);
  }

  await waitForApp(page);
  await page.getByRole("button", { name: /Open with a sample log/i }).click();
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  for (const path of ["/history", "/analytics", "/lab", "/settings", "/receipt", "/tools/lift-math"]) {
    await goTo(page, path);
  }
  expect(refused).toEqual([]);
});
