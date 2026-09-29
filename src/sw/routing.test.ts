import { describe, expect, it } from "vitest";
import { classify, shouldFallBackToShell, type RequestLike } from "./routing";

const ORIGIN = "https://lockd.example";
const precached = new Set([
  "/assets/index-abc123.js",
  "/assets/barlow-latin-400-normal-x.woff2",
  "/manifest.webmanifest",
  "/icon-192.png",
]);
const get = (path: string, mode = "cors", origin = ORIGIN): RequestLike => ({
  url: `${origin}${path}`,
  method: "GET",
  mode,
});
const strategy = (request: RequestLike) => classify(request, ORIGIN, precached);

describe("what the service worker does with a request", () => {
  it("serves the build's own files from the device", () => {
    expect(strategy(get("/assets/index-abc123.js", "no-cors"))).toBe("cache-first");
    expect(strategy(get("/assets/barlow-latin-400-normal-x.woff2"))).toBe("cache-first");
    expect(strategy(get("/manifest.webmanifest"))).toBe("cache-first");
    expect(strategy(get("/icon-192.png"))).toBe("cache-first");
  });

  it("opens app screens through the shell when the network fails", () => {
    for (const path of [
      "/",
      "/history",
      "/chronicle",
      "/workout/abc/summary",
      "/settings",
      "/library/x",
    ]) {
      expect(strategy(get(path, "navigate")), path).toBe("navigate");
    }
  });

  it("leaves the public screens to the network", () => {
    for (const path of ["/s/abc123", "/u/someone", "/login"]) {
      expect(strategy(get(path, "navigate")), path).toBe("network");
    }
  });

  it("never touches the server's data calls, other methods, or other origins", () => {
    expect(strategy(get("/_serverFn/abc?payload=1"))).toBe("network");
    expect(strategy(get("/api/anything"))).toBe("network");
    expect(strategy(get("/auth/popup", "navigate"))).toBe("network");
    expect(strategy(get("/__grok/manifest.webmanifest"))).toBe("network");
    expect(strategy({ ...get("/history", "navigate"), method: "POST" })).toBe("network");
    expect(strategy(get("/assets/index-abc123.js", "no-cors", "https://cdn.other.example"))).toBe(
      "network",
    );
    expect(strategy(get("/somewhere-uncached.json"))).toBe("network");
  });

  it("never caches the worker script, so an update is always seen", () => {
    expect(strategy(get("/sw.js"))).toBe("network");
    expect(classify(get("/sw.js"), ORIGIN, new Set(["/sw.js"]))).toBe("network");
  });

  it("does not treat a lookalike as a public screen or a server path", () => {
    expect(strategy(get("/history/s/x", "navigate"))).toBe("navigate");
    expect(strategy(get("/sessions", "navigate"))).toBe("navigate");
    expect(strategy(get("/users", "navigate"))).toBe("navigate");
    expect(strategy(get("/login-help", "navigate"))).toBe("navigate");
  });

  it("falls back to the shell for a server error, not for a page or a client error", () => {
    expect([200, 301, 304, 401, 404].map(shouldFallBackToShell)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect([500, 502, 503, 504].map(shouldFallBackToShell)).toEqual([true, true, true, true]);
  });
});
