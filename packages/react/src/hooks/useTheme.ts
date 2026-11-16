import { useSyncExternalStore } from "react";
import type { ThemeMode } from "@commerce-ai-tool/core/client";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToColorScheme(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getColorSchemeSnapshot(): "light" | "dark" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** The server cannot know the visitor's scheme: `light` is the stable default markup. */
function getServerColorSchemeSnapshot(): "light" {
  return "light";
}

/**
 * The scheme the widget renders: `light` or `dark`. An explicit `theme` is returned as is, with
 * no first-render flash; `auto` follows `prefers-color-scheme` and updates when it changes. The
 * server and the hydration pass use `light`, so SSR markup and the first client render agree.
 */
export function useResolvedTheme(theme: ThemeMode = "auto"): "light" | "dark" {
  const systemScheme = useSyncExternalStore(
    subscribeToColorScheme,
    getColorSchemeSnapshot,
    getServerColorSchemeSnapshot,
  );
  return theme === "light" || theme === "dark" ? theme : systemScheme;
}

/**
 * Value for the widget's `data-theme` attribute: `light` or `dark` as given, `auto` unchanged so
 * the CSS can follow the system scheme itself. Use {@link useResolvedTheme} for the concrete scheme.
 */
export function useTheme(theme: ThemeMode = "auto"): ThemeMode {
  return theme;
}
