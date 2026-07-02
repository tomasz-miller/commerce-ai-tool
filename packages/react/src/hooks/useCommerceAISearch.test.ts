import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCommerceAISearch } from "./useCommerceAISearch.js";

describe("useCommerceAISearch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets hasSearched after an empty search response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          products: [],
          meta: { queryInterpretation: "red shoes" },
        }),
      }),
    );

    const { result } = renderHook(() =>
      useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai" }),
    );

    await act(async () => {
      await result.current.search("red shoes");
    });

    await waitFor(() => {
      expect(result.current.hasSearched).toBe(true);
    });
    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("resets hasSearched when the query is cleared", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ products: [], meta: {} }),
      }),
    );

    const { result } = renderHook(() =>
      useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai" }),
    );

    await act(async () => {
      await result.current.search("boots");
    });

    act(() => {
      result.current.setQuery("");
    });

    expect(result.current.hasSearched).toBe(false);
  });
});
