import { describe, expect, it } from "vitest";

describe("test environment", () => {
  it("runs in UTC, so local-noon fixtures are the same instant on every machine", () => {
    expect(new Date(2026, 8, 28, 12).toISOString()).toBe("2026-09-28T12:00:00.000Z");
    expect(new Date(2026, 8, 28, 12).getTimezoneOffset()).toBe(0);
  });
});
