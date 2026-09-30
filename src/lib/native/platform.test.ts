import { describe, expect, it } from "vitest";
import { isNativePlatform, platform } from "./platform";

describe("platform", () => {
  it("is the web in a browser or a test, so native bridges stay no-ops", () => {
    expect(platform()).toBe("web");
    expect(isNativePlatform()).toBe(false);
  });
});
