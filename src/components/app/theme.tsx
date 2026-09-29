import { useEffect } from "react";
import { loadCanvasFonts } from "@/lib/fonts";
import { useGym } from "@/lib/gym/store";

export function ThemeSync() {
  // Load the faces the posters, receipts and lock-screen art draw with, so a download never waits or falls back.
  useEffect(() => {
    void loadCanvasFonts();
  }, []);

  const themeMode = useGym((s) => s.settings.themeMode);
  const presentation = useGym((s) => s.settings.presentationMode);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const theme = themeMode === "system" ? (prefersDark ? "dark" : "light") : themeMode;
      root.dataset.theme = theme;
      root.dataset.presentation = presentation ?? "loud";
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [themeMode, presentation]);

  return null;
}
