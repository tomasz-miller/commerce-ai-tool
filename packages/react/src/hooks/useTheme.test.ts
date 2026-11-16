import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResolvedTheme, useTheme } from "./useTheme.js";

function stubColorScheme(initialDark: boolean) {
  let matches = initialDark;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return matches;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    })),
  );
  return {
    setDark(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener());
    },
    listenerCount: () => listeners.size,
  };
}

describe("useResolvedTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an explicit mode on the first render", () => {
    const scheme = stubColorScheme(false);

    const { result } = renderHook(() => useResolvedTheme("dark"));

    expect(result.current).toBe("dark");
    expect(scheme.listenerCount()).toBe(1);
  });

  it("resolves auto to the system scheme and follows changes", () => {
    const scheme = stubColorScheme(true);

    const { result } = renderHook(() => useResolvedTheme("auto"));
    expect(result.current).toBe("dark");

    act(() => scheme.setDark(false));
    expect(result.current).toBe("light");
  });

  it("renders light on the server, where the visitor's scheme is unknown", () => {
    function Probe() {
      return createElement("span", null, useResolvedTheme("auto"));
    }

    expect(renderToString(createElement(Probe))).toContain("light");
  });
});

describe("useTheme", () => {
  it("returns the mode as given, auto included", () => {
    expect(renderHook(() => useTheme("dark")).result.current).toBe("dark");
    expect(renderHook(() => useTheme("light")).result.current).toBe("light");
    expect(renderHook(() => useTheme()).result.current).toBe("auto");
  });
});
