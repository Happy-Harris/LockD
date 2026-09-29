import { afterEach, describe, expect, it, vi } from "vitest";
import { FONTS } from "./brand";
import { canvasFontsLoaded, loadCanvasFonts } from "./fonts";

const setFonts = (fonts: unknown) => vi.stubGlobal("document", { fonts });
afterEach(() => vi.unstubAllGlobals());

describe("canvas fonts", () => {
  it("reports loaded when the browser has no font API (nothing to wait for)", () => {
    vi.stubGlobal("document", undefined);
    expect(canvasFontsLoaded()).toBe(true);
    setFonts(undefined);
    expect(canvasFontsLoaded()).toBe(true);
  });

  it("reports not loaded while any face the canvases use is still loading", () => {
    const loaded = new Set<string>();
    setFonts({ check: (spec: string) => loaded.has(spec) });
    expect(canvasFontsLoaded()).toBe(false);
  });

  it("loads all three families and waits for the page's fonts, then reports loaded", async () => {
    const requested: string[] = [];
    const loaded = new Set<string>();
    let readyAwaited = false;
    setFonts({
      check: (spec: string) => loaded.has(spec),
      load: async (spec: string) => {
        requested.push(spec);
        loaded.add(spec);
        return [];
      },
      get ready() {
        readyAwaited = true;
        return Promise.resolve();
      },
    });
    expect(canvasFontsLoaded()).toBe(false);
    await loadCanvasFonts();
    for (const family of [FONTS.display, FONTS.sans, FONTS.mono]) {
      expect(
        requested.some((spec) => spec.includes(family)),
        family,
      ).toBe(true);
    }
    expect(readyAwaited).toBe(true);
    expect(canvasFontsLoaded()).toBe(true);
  });

  it("never rejects when a font fails to load", async () => {
    setFonts({
      check: () => false,
      load: async () => {
        throw new Error("network");
      },
      ready: Promise.resolve(),
    });
    await expect(loadCanvasFonts()).resolves.toBeUndefined();
  });
});
