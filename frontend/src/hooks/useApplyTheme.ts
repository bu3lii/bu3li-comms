import { useEffect } from "react";
import { useThemeStore } from "../stores/themeStore";

/** The CSS tokens (src/index.css) key off `data-theme` on <html>; this just keeps that attribute in sync with the store. */
export function useApplyTheme(): void {
  const mode = useThemeStore((s) => s.mode);

  useEffect(() => {
    if (mode === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", mode);
    }
  }, [mode]);
}
