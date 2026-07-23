import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCommerceAISearch } from "./useCommerceAISearch.js";

describe("useCommerceAISearch autocomplete", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches suggestions when autocomplete is enabled", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ suggestions: ["Red Shoes"] }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useCommerceAISearch({
        apiBaseUrl: "/api/commerce-ai",
        enableAutocomplete: true,
      }),
    );

    act(() => {
      result.current.setQuery("re");
    });

    await waitFor(() => {
      expect(result.current.suggestions).toEqual(["Red Shoes"]);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/commerce-ai/search/suggestions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ query: "re" }),
      }),
    );
  });

  it("runs full search when a suggestion is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        products: [{ id: "p1", name: "Red Shoes" }],
        meta: { total: 1 },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useCommerceAISearch({
        apiBaseUrl: "/api/commerce-ai",
        enableAutocomplete: true,
      }),
    );

    await act(async () => {
      await result.current.selectSuggestion("Red Shoes");
    });

    await waitFor(() => {
      expect(result.current.results).toEqual([{ id: "p1", name: "Red Shoes" }]);
    });
  });

  it("clears previous results when typing so suggestions can show again", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          products: [{ id: "p1", name: "Glass" }],
          meta: { total: 1 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ suggestions: ["Wine Glass"] }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useCommerceAISearch({
        apiBaseUrl: "/api/commerce-ai",
        enableAutocomplete: true,
      }),
    );

    await act(async () => {
      await result.current.search("glass");
    });

    await waitFor(() => {
      expect(result.current.results).toHaveLength(1);
      expect(result.current.hasSearched).toBe(true);
    });

    act(() => {
      result.current.setQuery("wi");
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.hasSearched).toBe(false);

    await waitFor(() => {
      expect(result.current.suggestions).toEqual(["Wine Glass"]);
    });
  });
});
