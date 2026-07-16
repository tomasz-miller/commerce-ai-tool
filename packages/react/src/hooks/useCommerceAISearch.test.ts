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

  it("sends suggestedFacets on chip refine and supports startNewSearch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        products: [{ id: "p1", name: "Glass" }],
        facets: [
          {
            id: "color",
            label: "Color",
            type: "distinct",
            buckets: [{ key: "red", label: "red", count: 1 }],
          },
        ],
        suggestedFacets: [{ name: "color" }],
        meta: {
          total: 1,
          limit: 20,
          offset: 0,
          locale: "en",
          catalogLocale: "en",
          queryLocale: "en",
          queryInterpretation: "glasses",
          searchTerms: ["glasses"],
          appliedFilters: {},
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai", enableFacets: true, persistSession: false }),
    );

    await act(async () => {
      await result.current.search("glasses");
    });

    await act(async () => {
      await result.current.refineFilters?.({ color: "red" });
    });

    const refineBody = JSON.parse(
      (fetchMock.mock.calls.at(-1)?.[1] as { body: string }).body,
    ) as { suggestedFacets?: Array<{ name: string }>; filters?: Record<string, string> };
    expect(refineBody.suggestedFacets).toEqual([{ name: "color" }]);
    expect(refineBody.filters).toEqual({ color: "red" });

    await act(async () => {
      await result.current.startNewSearch?.();
    });

    const newSearchBody = JSON.parse(
      (fetchMock.mock.calls.at(-1)?.[1] as { body: string }).body,
    ) as { searchTerms?: string[]; includeFacets?: boolean; refineQuery?: string };
    expect(newSearchBody.searchTerms).toBeUndefined();
    expect(newSearchBody.refineQuery).toBeUndefined();
    expect(newSearchBody.includeFacets).toBe(true);
  });
});
