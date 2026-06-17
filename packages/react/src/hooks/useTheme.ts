import { useEffect, useState } from "react";
import type { ThemeMode } from "@commerce-ai-tool/core";

export function useTheme(theme: ThemeMode = "auto"): ThemeMode {
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (theme === "light" || theme === "dark") {
      setResolved(theme);
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setResolved(media.matches ? "dark" : "light");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);

  return theme === "auto" ? "auto" : resolved;
}

export function useResolvedTheme(theme: ThemeMode = "auto"): "light" | "dark" | "auto" {
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (theme !== "auto") {
      setResolved(theme);
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setResolved(media.matches ? "dark" : "light");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);

  return theme === "auto" ? "auto" : resolved;
}
