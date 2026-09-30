import { Capacitor } from "@capacitor/core";

/**
 * Where the app is running. The web app and the Capacitor shell are one codebase (principle 6); native-only
 * features (lock-screen timer, health, watch) sit behind small bridges that do nothing on the web, so the web
 * behaves exactly as before. Everything here is safe on the server and in tests.
 */

export type Platform = "web" | "ios" | "android";

export function platform(): Platform {
  try {
    const name = Capacitor.getPlatform();
    return name === "ios" || name === "android" ? name : "web";
  } catch {
    return "web";
  }
}

export const isNativePlatform = (): boolean => platform() !== "web";
