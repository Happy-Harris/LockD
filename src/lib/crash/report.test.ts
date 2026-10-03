import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/browser";
import { scrubEvent, scrubText, scrubUrl } from "./report";

const TOKEN = "a".repeat(43);

describe("crash reports carry the error and the page, nothing that identifies a lifter", () => {
  it("replaces share ids, handles and history tokens wherever they appear", () => {
    expect(scrubText(`/h/${TOKEN}`)).toBe("/h/:token");
    expect(scrubText("/s/0b7a-11/x and /u/sam")).toBe("/s/:id/x and /u/:handle");
    expect(scrubText("at https://lockd.example/h/" + TOKEN + ":1:20")).toBe(
      "at https://lockd.example/h/:token:1:20",
    );
    expect(scrubText("/history/123")).toBe("/history/123");
  });

  it("reduces a URL to its scrubbed path", () => {
    expect(scrubUrl(`https://lockd.example/h/${TOKEN}?offset=30#top`)).toBe("/h/:token");
    expect(scrubUrl("https://lockd.example/workout?x=1")).toBe("/workout");
  });

  it("keeps the error and the page, and drops user, request detail, breadcrumbs and extras", () => {
    const event = {
      event_id: "e1",
      type: undefined,
      level: "error",
      message: "Failed for /u/sam",
      exception: {
        values: [
          {
            type: "TypeError",
            value: `cannot read x at /h/${TOKEN}`,
            stacktrace: {
              frames: [
                {
                  filename: `https://lockd.example/h/${TOKEN}`,
                  function: "f",
                  vars: { notes: "private" },
                },
              ],
            },
          },
        ],
      },
      request: {
        url: `https://lockd.example/s/abc?ref=1`,
        headers: { Cookie: "secret", Referer: "x" },
        cookies: { a: "b" },
      },
      user: { id: "user-1", email: "lifter@example.com", ip_address: "1.2.3.4" },
      breadcrumbs: [{ message: "Bench Press 100 kg × 5" }],
      extra: { workout: "Push" },
      tags: { lift: "bench" },
      contexts: { browser: { name: "Chrome" }, os: { name: "iOS" }, state: { log: "everything" } },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event)!;
    expect(out.exception?.values?.[0]).toMatchObject({
      type: "TypeError",
      value: "cannot read x at /h/:token",
    });
    expect(out.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({
      filename: "https://lockd.example/h/:token",
      function: "f",
      abs_path: undefined,
      vars: undefined,
    });
    expect(out.message).toBe("Failed for /u/:handle");
    expect(out.request).toEqual({ url: "/s/:id" });
    expect(out.contexts).toEqual({ browser: { name: "Chrome" }, os: { name: "iOS" } });
    const text = JSON.stringify(out);
    for (const leak of [
      "user-1",
      "lifter@example.com",
      "1.2.3.4",
      "secret",
      "Bench Press",
      "Push",
      "bench",
      "private",
      "everything",
      TOKEN,
    ]) {
      expect(text).not.toContain(leak);
    }
  });
});
