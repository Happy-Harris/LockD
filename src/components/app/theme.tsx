import { useEffect } from "react";
import { useGym } from "@/lib/gym/store";

export function ThemeSync() {
  const themeMode = useGym((s) => s.settings.themeMode);
  const accent = useGym((s) => s.settings.accentTheme);
  const presentation = useGym((s) => s.settings.presentationMode);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const theme = themeMode === "system" ? (prefersDark ? "dark" : "light") : themeMode;
      root.dataset.theme = theme;
      root.dataset.accent = accent;
      root.dataset.presentation = presentation ?? "loud";
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [themeMode, accent, presentation]);

  return null;
}
