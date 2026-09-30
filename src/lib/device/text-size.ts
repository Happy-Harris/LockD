import { useSyncExternalStore } from "react";
import { getLockdDb } from "@/lib/storage/db";

/**
 * Text size (owner's spec, Appendix A; plan addendum § 6 item 1 and A-4). A preset changes type
 * roles, never the root font size, so display type stays put. It belongs to this device: it is kept
 * in the device-only `device` table and a `localStorage` mirror the pre-paint script reads, never in
 * settings, the persisted log or the cloud vault, so Large on a phone never forces Large on a tablet.
 * A backup carries it and restores it only when the file has one.
 */

export const TEXT_SIZES = ["standard", "comfortable", "large"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_SIZE_LABEL: Record<TextSize, string> = {
  standard: "Standard",
  comfortable: "Comfortable",
  large: "Large",
};

/**
 * Comfortable since step B (spec: "flip the default to Comfortable as a one-line change that is trivial to revert").
 * A lifter who never chose a size is told once, and can keep the previous one (`TextSizeNotice`).
 */
export const DEFAULT_TEXT_SIZE: TextSize = "comfortable";

/** The mirror the pre-paint script reads, so a cold start never flashes another size. */
export const TEXT_SIZE_STORAGE_KEY = "lockd-text-size";
/** The row in the device-only table. */
export const TEXT_SIZE_DEVICE_KEY = "textSize";

export const isTextSize = (value: unknown): value is TextSize =>
  typeof value === "string" && (TEXT_SIZES as readonly string[]).includes(value);

/**
 * Runs in `<head>` before the stylesheet paints anything: sets `data-text-size` on `<html>` from the
 * stored value, or the default. Kept tiny and dependency-free; a blocked `localStorage` gets the default.
 */
export const TEXT_SIZE_PREPAINT_SCRIPT = `(function(){var v=null;try{v=localStorage.getItem(${JSON.stringify(
  TEXT_SIZE_STORAGE_KEY,
)})}catch(e){}if(!(${TEXT_SIZES.map((size) => `v===${JSON.stringify(size)}`).join("||")}))v=${JSON.stringify(
  DEFAULT_TEXT_SIZE,
)};document.documentElement.setAttribute("data-text-size",v)})();`;

const listeners = new Set<() => void>();

function readMirror(): TextSize | null {
  try {
    const value = window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
    return isTextSize(value) ? value : null;
  } catch {
    return null;
  }
}

/** The size this device chose, or null when it never chose one. */
export function storedTextSize(): TextSize | null {
  if (typeof window === "undefined") return null;
  return readMirror();
}

/** The size in effect: the device's choice, else the default. */
export function currentTextSize(): TextSize {
  return storedTextSize() ?? DEFAULT_TEXT_SIZE;
}

function paint(size: TextSize) {
  if (typeof document !== "undefined") document.documentElement.setAttribute("data-text-size", size);
}

/** Chooses a size for this device: paints it, mirrors it for the next cold start, and records it. */
export function setTextSize(size: TextSize): void {
  if (typeof window === "undefined") return;
  paint(size);
  try {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size);
  } catch {
    // Private mode or a full quota: the size still applies until the page closes.
  }
  void getLockdDb()
    .device.put({ key: TEXT_SIZE_DEVICE_KEY, value: size })
    .catch(() => undefined);
  for (const listener of listeners) listener();
}

/**
 * At start-up: when the mirror was cleared but the device table still has the choice, restore it,
 * so clearing site storage partly never quietly resets a lifter who chose Large.
 */
export async function restoreTextSizeFromDevice(): Promise<void> {
  if (typeof window === "undefined" || readMirror()) return;
  try {
    const row = await getLockdDb().device.get(TEXT_SIZE_DEVICE_KEY);
    if (isTextSize(row?.value)) setTextSize(row.value);
  } catch {
    // No IndexedDB: the default stands.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The size in effect, re-rendering when it changes on this device. */
export function useTextSize(): TextSize {
  return useSyncExternalStore(subscribe, currentTextSize, () => DEFAULT_TEXT_SIZE);
}

/** Chart axis labels follow the caption role, capped at Comfortable (fewer ticks, not smaller text). */
export const CHART_TICK_PX: Record<TextSize, number> = { standard: 12, comfortable: 14, large: 14 };
