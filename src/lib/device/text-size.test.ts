// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { LockdBackup } from "@/domain/types";
import { backupSchema } from "@/lib/backup/schema";
import { cloudGymFromState } from "@/lib/cloud/payload";
import { useGym } from "@/lib/gym/store";
import { getLockdDb } from "@/lib/storage/db";
import oldBackup from "@/test/fixtures/backup/lockd-backup-v3-before-type-union.json";
import {
  currentTextSize,
  DEFAULT_TEXT_SIZE,
  restoreTextSizeFromDevice,
  setTextSize,
  TEXT_SIZE_DEVICE_KEY,
  TEXT_SIZE_PREPAINT_SCRIPT,
  TEXT_SIZE_STORAGE_KEY,
} from "./text-size";

const html = () => document.documentElement;

beforeEach(async () => {
  window.localStorage.clear();
  html().removeAttribute("data-text-size");
  await getLockdDb().device.clear();
  useGym.getState().resetAll();
});

describe("text size is a device preference (spec Appendix A, step A)", () => {
  it("defaults to Standard in step A, so the token migration changes nothing", () => {
    expect(DEFAULT_TEXT_SIZE).toBe("standard");
    expect(currentTextSize()).toBe("standard");
  });

  it("the pre-paint script applies the stored size before the app loads, and ignores anything else", () => {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, "large");
    new Function(TEXT_SIZE_PREPAINT_SCRIPT)();
    expect(html().getAttribute("data-text-size")).toBe("large");

    html().removeAttribute("data-text-size");
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, "huge");
    new Function(TEXT_SIZE_PREPAINT_SCRIPT)();
    expect(html().hasAttribute("data-text-size")).toBe(false);
  });

  it("choosing a size paints it, mirrors it for the next cold start, and records it in the device table", async () => {
    setTextSize("comfortable");
    expect(html().getAttribute("data-text-size")).toBe("comfortable");
    expect(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)).toBe("comfortable");
    await expect.poll(async () => (await getLockdDb().device.get(TEXT_SIZE_DEVICE_KEY))?.value).toBe("comfortable");
    expect(currentTextSize()).toBe("comfortable");
  });

  it("a cleared mirror is restored from the device table", async () => {
    await getLockdDb().device.put({ key: TEXT_SIZE_DEVICE_KEY, value: "large" });
    await restoreTextSizeFromDevice();
    expect(currentTextSize()).toBe("large");
    expect(html().getAttribute("data-text-size")).toBe("large");
  });

  it("is never part of settings or the cloud vault, so another signed-in device keeps its own", () => {
    setTextSize("large");
    const state = useGym.getState();
    expect(JSON.stringify(state.settings)).not.toContain("large");
    expect(JSON.stringify(cloudGymFromState(state))).not.toContain("textSize");
  });
});

describe("text size in a backup", () => {
  it("a backup carries this device's size", () => {
    setTextSize("large");
    const backup = useGym.getState().exportBackup();
    expect(backup.device).toEqual({ textSize: "large" });
    expect(backupSchema.safeParse(JSON.parse(JSON.stringify(backup))).success).toBe(true);
  });

  it("restoring an old backup without the field keeps the current size (fix 4)", () => {
    setTextSize("large");
    const backup = oldBackup as unknown as LockdBackup;
    expect(backup.device).toBeUndefined();
    expect(backupSchema.safeParse(oldBackup).success).toBe(true);
    useGym.getState().importBackup(backup, "replace");
    expect(currentTextSize()).toBe("large");
  });

  it("restoring a backup with a size applies it", () => {
    const backup = { ...(oldBackup as unknown as LockdBackup), device: { textSize: "comfortable" as const } };
    useGym.getState().importBackup(backup, "merge");
    expect(currentTextSize()).toBe("comfortable");
  });

  it("a backup with an unknown size is refused, not guessed", () => {
    const bad = { ...oldBackup, device: { textSize: "huge" } };
    expect(backupSchema.safeParse(bad).success).toBe(false);
  });
});

describe("the role tokens", () => {
  const css = readFileSync(path.resolve(__dirname, "../../styles.css"), "utf8");

  it("Standard keeps today's sizes: micro 11 px, legacy micro and tab labels 10 px", () => {
    const root = css.match(/:root \{\s+--type-micro: ([^;]+);\s+--type-micro-legacy: ([^;]+);\s+--type-tab: ([^;]+);/);
    expect(root?.slice(1)).toEqual(["0.6875rem", "0.625rem", "0.625rem"]);
  });

  it("no preset changes the root font size, so display type stays put", () => {
    expect(css).not.toMatch(/html\s*\{[^}]*font-size/);
    expect(css).not.toMatch(/data-text-size[^{]*\{[^}]*--text-(lg|xl|[2-9]xl)/);
  });

  it("no preset puts micro text below 11 px", () => {
    for (const preset of ["comfortable", "large"]) {
      const block = css.match(new RegExp(`data-text-size="${preset}"\\] \\{([^}]*)\\}`))?.[1] ?? "";
      const rems = [...block.matchAll(/--type-micro(?:-legacy)?: ([\d.]+)rem/g)].map((m) => Number(m[1]) * 16);
      expect(rems.length).toBe(2);
      for (const px of rems) expect(px).toBeGreaterThanOrEqual(11);
    }
  });
});
