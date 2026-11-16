import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COMMERCE_AI_SEARCH_MESSAGES } from "@commerce-ai-tool/core/client";
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

  it("sends enableMissions and stores grouped results", async () => {
    const mission = {
      interpretation: "racket and balls",
      intents: [
        {
          intent: { id: "intent-0", label: "racket", quantity: 1, searchTerms: ["racket"] },
          products: [{ id: "p1", name: "Racket" }],
          total: 1,
        },
        {
          intent: { id: "intent-1", label: "balls", quantity: 2, searchTerms: ["balls"] },
          products: [{ id: "p2", name: "Balls" }],
          total: 1,
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        products: [{ id: "p1", name: "Racket" }, { id: "p2", name: "Balls" }],
        mission,
        meta: { queryInterpretation: "racket and balls" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai", enableMissions: true }),
    );

    await act(async () => {
      await result.current.search("a racket and two balls");
    });

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as {
      enableMissions?: boolean;
    };
    expect(body.enableMissions).toBe(true);
    expect(result.current.mission).toEqual(mission);

    act(() => {
      result.current.setQuery("");
    });
    expect(result.current.mission).toBeNull();
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

  it("does not open a facet session for mission results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        products: [{ id: "p1", name: "Racket" }, { id: "p2", name: "Balls" }],
        mission: {
          interpretation: "racket and balls",
          intents: [
            {
              intent: { id: "intent-0", label: "racket", quantity: 1, searchTerms: ["racket"] },
              products: [{ id: "p1", name: "Racket" }],
              total: 1,
            },
            {
              intent: { id: "intent-1", label: "balls", quantity: 2, searchTerms: ["balls"] },
              products: [{ id: "p2", name: "Balls" }],
              total: 1,
            },
          ],
        },
        meta: {
          queryInterpretation: "racket and balls",
          searchTerms: ["racket", "balls"],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useCommerceAISearch({
        apiBaseUrl: "/api/commerce-ai",
        enableFacets: true,
        enableMissions: true,
        persistSession: false,
      }),
    );

    await act(async () => {
      await result.current.search("a racket and two balls");
    });

    expect(result.current.hasFacetSession).toBe(false);
    expect(result.current.mission).not.toBeNull();
  });

  it("sends enableMissions on image search and stores grouped results", async () => {
    const mission = {
      interpretation: "glasses and table",
      intents: [
        {
          intent: { id: "intent-0", label: "glasses", quantity: 1, searchTerms: ["glasses"] },
          products: [{ id: "p1", name: "Glass" }],
          total: 1,
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        products: [{ id: "p1", name: "Glass" }],
        mission,
        interpretation: "glasses and a coffee table",
        meta: { queryInterpretation: "glasses and a coffee table" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai", enableMissions: true }),
    );

    await act(async () => {
      await result.current.searchByImage(new File(["img"], "photo.jpg", { type: "image/jpeg" }));
    });

    const formData = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(formData.get("enableMissions")).toBe("true");
    expect(result.current.mission).toEqual(mission);
  });

  describe("facetSelections", () => {
    const facetResponse = {
      products: [{ id: "p1", name: "Glass" }],
      facets: [
        {
          id: "categories",
          label: "Categories",
          type: "distinct",
          buckets: [{ key: "cat-1", label: "Glasses", count: 3 }],
        },
        {
          id: "color",
          label: "Color",
          type: "distinct",
          buckets: [
            { key: "red", label: "red", count: 2 },
            { key: "blue", label: "blue", count: 1 },
          ],
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
    };

    function lastBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
      return JSON.parse((fetchMock.mock.calls.at(-1)?.[1] as { body: string }).body) as Record<
        string,
        unknown
      >;
    }

    async function startFacetSession() {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => facetResponse });
      vi.stubGlobal("fetch", fetchMock);
      const hook = renderHook(() =>
        useCommerceAISearch({
          apiBaseUrl: "/api/commerce-ai",
          enableFacets: true,
          persistSession: false,
        }),
      );
      await act(async () => {
        await hook.result.current.search("glasses");
      });
      return { fetchMock, result: hook.result };
    }

    it("lists every selected group, categories included, with its selected value", async () => {
      const { fetchMock, result } = await startFacetSession();

      await act(async () => {
        await result.current.refineFilters?.({ category: "cat-1", color: "red" });
      });

      expect(lastBody(fetchMock).facetSelections).toEqual({
        categories: ["cat-1"],
        color: ["red"],
      });
    });

    it("omits the field when no chip is selected", async () => {
      const { fetchMock, result } = await startFacetSession();

      expect(lastBody(fetchMock)).not.toHaveProperty("facetSelections");

      await act(async () => {
        await result.current.refineFilters?.({ color: "red" });
      });
      expect(lastBody(fetchMock).facetSelections).toEqual({ color: ["red"] });

      await act(async () => {
        await result.current.refineFilters?.({});
      });
      expect(lastBody(fetchMock)).not.toHaveProperty("facetSelections");

      await act(async () => {
        await result.current.refine?.("cheaper");
      });
      expect(lastBody(fetchMock)).not.toHaveProperty("facetSelections");
    });
  });

  describe("facetSelections and echoed model filters", () => {
    const echoedResponse = {
      products: [{ id: "p1", name: "Shoe" }],
      facets: [
        {
          id: "categories",
          label: "Categories",
          type: "distinct",
          buckets: [{ key: "cat-1", label: "Shoes", count: 3 }],
        },
        {
          id: "color",
          label: "Color",
          type: "distinct",
          buckets: [{ key: "red", label: "red", count: 2 }],
        },
        {
          id: "size",
          label: "Size",
          type: "distinct",
          buckets: [{ key: "M", label: "M", count: 1 }],
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
        queryInterpretation: "red shoes",
        searchTerms: ["shoes"],
        // The model's own constraint, echoed back: not a chip the shopper clicked.
        appliedFilters: { color: "red" },
      },
    };

    function bodyOf(fetchMock: ReturnType<typeof vi.fn>, index: number): Record<string, unknown> {
      return JSON.parse((fetchMock.mock.calls[index]?.[1] as { body: string }).body) as Record<
        string,
        unknown
      >;
    }

    it("sends no facetSelections for a model constraint, only for clicked chip groups", async () => {
      // Like the server: echo the request's filters back as `meta.appliedFilters`.
      const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
        const { filters } = JSON.parse(init.body) as { filters?: Record<string, string> };
        return {
          ok: true,
          json: async () => ({
            ...echoedResponse,
            meta: { ...echoedResponse.meta, appliedFilters: filters ?? { color: "red" } },
          }),
        };
      });
      vi.stubGlobal("fetch", fetchMock);
      const { result } = renderHook(() =>
        useCommerceAISearch({
          apiBaseUrl: "/api/commerce-ai",
          enableFacets: true,
          persistSession: false,
        }),
      );

      await act(async () => {
        await result.current.search("red shoes");
      });
      await act(async () => {
        await result.current.refine?.("cheaper");
      });
      expect(bodyOf(fetchMock, 1).filters).toEqual({ color: "red" });
      expect(bodyOf(fetchMock, 1)).not.toHaveProperty("facetSelections");

      await act(async () => {
        await result.current.refineFilters?.({ color: "red", size: "M" });
      });
      expect(bodyOf(fetchMock, 2).facetSelections).toEqual({ size: ["M"] });

      await act(async () => {
        await result.current.refine?.("cheaper");
      });
      expect(bodyOf(fetchMock, 3).facetSelections).toEqual({ size: ["M"] });

      await act(async () => {
        await result.current.refineFilters?.({ color: "red", size: "M", category: "cat-1" });
      });
      expect(bodyOf(fetchMock, 4).facetSelections).toEqual({ size: ["M"], categories: ["cat-1"] });

      await act(async () => {
        await result.current.refineFilters?.({ color: "red", category: "cat-1" });
      });
      expect(bodyOf(fetchMock, 5).facetSelections).toEqual({ categories: ["cat-1"] });
    });

    it("forgets clicked chips when a new search starts", async () => {
      // Like the server: echo the request's filters back as `meta.appliedFilters`.
      const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
        const { filters } = JSON.parse(init.body) as { filters?: Record<string, string> };
        return {
          ok: true,
          json: async () => ({
            ...echoedResponse,
            meta: { ...echoedResponse.meta, appliedFilters: filters ?? { color: "red" } },
          }),
        };
      });
      vi.stubGlobal("fetch", fetchMock);
      const { result } = renderHook(() =>
        useCommerceAISearch({
          apiBaseUrl: "/api/commerce-ai",
          enableFacets: true,
          persistSession: false,
        }),
      );

      await act(async () => {
        await result.current.search("red shoes");
      });
      await act(async () => {
        await result.current.refineFilters?.({ color: "red", size: "M" });
      });
      expect(bodyOf(fetchMock, 1).facetSelections).toEqual({ size: ["M"] });

      await act(async () => {
        await result.current.startNewSearch?.();
      });
      await act(async () => {
        await result.current.refine?.("cheaper");
      });
      expect(bodyOf(fetchMock, 3)).not.toHaveProperty("facetSelections");
    });
  });

  it("keeps working when sessionStorage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          products: [{ id: "p1", name: "Glass" }],
          meta: { searchTerms: ["glasses"], appliedFilters: {} },
        }),
      }),
    );

    const { result } = renderHook(() =>
      useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai", enableFacets: true }),
    );

    await act(async () => {
      await result.current.search("glasses");
    });
    act(() => {
      result.current.clear();
    });

    expect(result.current.hasFacetSession).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("shows the widget's message, not the server's text, when the search fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "Rate limit hit for key abc", code: "RATE_LIMITED" }),
      }),
    );

    const { result } = renderHook(() =>
      useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai" }),
    );

    await act(async () => {
      await result.current.search("boots");
    });

    expect(result.current.error).toBe(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.rateLimited);
  });
});

describe("useCommerceAISearch request ordering and cleanup", () => {
  const meta = {
    total: 1,
    limit: 20,
    offset: 0,
    locale: "en",
    catalogLocale: "en",
    queryLocale: "en",
    queryInterpretation: "q",
    searchTerms: ["shoes"],
    appliedFilters: {},
  };
  const facets = [
    {
      id: "color",
      label: "Color",
      type: "distinct",
      buckets: [{ key: "red", label: "red", count: 2 }],
    },
    {
      id: "size",
      label: "Size",
      type: "distinct",
      buckets: [{ key: "M", label: "M", count: 1 }],
    },
  ];

  interface Pending {
    url: string;
    init: { body: unknown; signal?: AbortSignal };
    resolve: (value: unknown) => void;
  }

  /**
   * A fetch whose responses the test releases by hand, in any order. Like the real one it rejects
   * with an AbortError as soon as its signal aborts (`rejectOnAbort: false` keeps it pending).
   */
  function stubManualFetch({ rejectOnAbort = true }: { rejectOnAbort?: boolean } = {}) {
    const pending: Pending[] = [];
    const fetchMock = vi.fn(
      (url: string, init: { body: unknown; signal?: AbortSignal }) =>
        new Promise((resolve, reject) => {
          pending.push({ url, init, resolve });
          if (rejectOnAbort) {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("The operation was aborted.", "AbortError")),
            );
          }
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const next = (suffix: string): Pending => {
      const found = pending.find((entry) => entry.url.endsWith(suffix));
      if (!found) throw new Error(`no pending ${suffix}`);
      pending.splice(pending.indexOf(found), 1);
      return found;
    };
    return { fetchMock, next };
  }

  const ok = (body: unknown) => ({ ok: true, json: async () => body });
  const imageFile = () => new File(["x"], "shoe.png", { type: "image/png" });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("a slower image search does not overwrite a newer text search", async () => {
    const { next } = stubManualFetch();
    const { result } = renderHook(() => useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai" }));

    let imageDone!: Promise<void>;
    let textDone!: Promise<void>;
    act(() => {
      imageDone = result.current.searchByImage(imageFile());
    });
    const image = next("/search/image");
    act(() => {
      textDone = result.current.search("red shoes");
    });
    const text = next("/search");
    // The newer search aborts the image request.
    expect(image.init.signal?.aborted).toBe(true);

    await act(async () => {
      text.resolve(ok({ products: [{ id: "text", name: "Text" }], meta }));
      await textDone;
    });
    await act(async () => {
      image.resolve(
        ok({ products: [{ id: "image", name: "Image" }], interpretation: "blue boots", meta }),
      );
      await imageDone;
    });

    expect(result.current.results.map((card) => card.id)).toEqual(["text"]);
    expect(result.current.query).toBe("");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("a newer image search wins over an older text search and clears its spinner", async () => {
    const { next } = stubManualFetch();
    const { result } = renderHook(() => useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai" }));

    let textDone!: Promise<void>;
    let imageDone!: Promise<void>;
    act(() => {
      textDone = result.current.search("red shoes");
    });
    const text = next("/search");
    act(() => {
      imageDone = result.current.searchByImage(imageFile());
    });
    const image = next("/search/image");
    expect(text.init.signal?.aborted).toBe(true);
    expect(image.init.signal).toBeInstanceOf(AbortSignal);

    await act(async () => {
      image.resolve(ok({ products: [{ id: "image", name: "Image" }], meta }));
      await imageDone;
    });
    await act(async () => {
      text.resolve(ok({ products: [{ id: "text", name: "Text" }], meta }));
      await textDone;
    });

    expect(result.current.results.map((card) => card.id)).toEqual(["image"]);
    expect(result.current.isLoading).toBe(false);
  });

  it("beginExternalSearch supersedes in-flight searches and invalidates older ids", async () => {
    const { next } = stubManualFetch();
    const { result } = renderHook(() => useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai" }));

    let textDone!: Promise<void>;
    act(() => {
      textDone = result.current.search("red shoes");
    });
    const text = next("/search");

    let first!: { requestId: number; signal: AbortSignal };
    act(() => {
      first = result.current.beginExternalSearch!();
    });
    expect(text.init.signal?.aborted).toBe(true);
    expect(first.signal.aborted).toBe(false);
    expect(result.current.isCurrentRequest!(first.requestId)).toBe(true);

    let second!: { requestId: number; signal: AbortSignal };
    act(() => {
      second = result.current.beginExternalSearch!();
    });
    expect(first.signal.aborted).toBe(true);
    expect(result.current.isCurrentRequest!(first.requestId)).toBe(false);
    expect(result.current.isCurrentRequest!(second.requestId)).toBe(true);

    await act(async () => {
      text.resolve(ok({ products: [{ id: "text", name: "Text" }], meta }));
      await textDone;
    });
    expect(result.current.results).toEqual([]);
  });

  describe("tracked chip groups", () => {
    /** Like the server: echo the request's filters back as `meta.appliedFilters`. */
    function stubEchoingFetch() {
      const fetchMock = vi.fn(async (url: string, init: { body: unknown }) => {
        if (url.endsWith("/search/image")) {
          return ok({
            products: [{ id: "image", name: "Image" }],
            facets,
            meta: { ...meta, appliedFilters: { color: "red" } },
          });
        }
        const { filters } = JSON.parse(init.body as string) as { filters?: Record<string, string> };
        return ok({
          products: [{ id: "p1", name: "Shoe" }],
          facets,
          meta: { ...meta, appliedFilters: filters ?? { color: "red" } },
        });
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    function textBody(fetchMock: ReturnType<typeof vi.fn>, index: number): Record<string, unknown> {
      return JSON.parse((fetchMock.mock.calls[index]?.[1] as { body: string }).body) as Record<
        string,
        unknown
      >;
    }

    function renderFacets() {
      return renderHook(() =>
        useCommerceAISearch({
          apiBaseUrl: "/api/commerce-ai",
          enableFacets: true,
          persistSession: false,
        }),
      );
    }

    it("searchByImage forgets clicked chips like a new search", async () => {
      const fetchMock = stubEchoingFetch();
      const { result } = renderFacets();

      await act(async () => {
        await result.current.search("red shoes");
      });
      await act(async () => {
        await result.current.refineFilters?.({ color: "red", size: "M" });
      });
      expect(textBody(fetchMock, 1).facetSelections).toEqual({ size: ["M"] });

      await act(async () => {
        await result.current.searchByImage(imageFile());
      });
      await act(async () => {
        await result.current.refine?.("cheaper");
      });
      expect(textBody(fetchMock, 3)).not.toHaveProperty("facetSelections");
    });

    it("beginExternalSearch forgets clicked chips like a new search", async () => {
      const fetchMock = stubEchoingFetch();
      const { result } = renderFacets();

      await act(async () => {
        await result.current.search("red shoes");
      });
      await act(async () => {
        await result.current.refineFilters?.({ color: "red", size: "M" });
      });
      act(() => {
        result.current.beginExternalSearch!();
      });
      await act(async () => {
        await result.current.refine?.("cheaper");
      });
      expect(textBody(fetchMock, 2)).not.toHaveProperty("facetSelections");
    });

    it.each(["refine", "refineFilters"] as const)(
      "%s cancels a pending debounced search for text typed before it",
      async (method) => {
        vi.useFakeTimers();
        const fetchMock = stubEchoingFetch();
        const { result } = renderHook(() =>
          useCommerceAISearch({
            apiBaseUrl: "/api/commerce-ai",
            enableFacets: true,
            persistSession: false,
            debounceMs: 250,
          }),
        );

        await act(async () => {
          await result.current.search("red shoes");
        });
        act(() => {
          result.current.setQuery("blue boots");
        });
        await act(async () => {
          if (method === "refine") {
            await result.current.refine?.("cheaper");
          } else {
            await result.current.refineFilters?.({ color: "red" });
          }
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000);
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(textBody(fetchMock, 1).query).toBe("red shoes");
      },
    );

    it("a superseded image result does not touch the tracked chips", async () => {
      const { fetchMock, next } = stubManualFetch();
      const { result } = renderFacets();
      const respond = (suffix: string, appliedFilters: Record<string, string>) =>
        next(suffix).resolve(
          ok({ products: [{ id: "p", name: "P" }], facets, meta: { ...meta, appliedFilters } }),
        );

      let imageDone!: Promise<void>;
      act(() => {
        imageDone = result.current.searchByImage(imageFile());
      });
      const image = next("/search/image");

      await act(async () => {
        const textDone = result.current.search("red shoes");
        await Promise.resolve();
        respond("/search", { color: "red" });
        await textDone;
      });
      await act(async () => {
        const chipDone = result.current.refineFilters?.({ color: "red", size: "M" });
        await Promise.resolve();
        respond("/search", { color: "red", size: "M" });
        await chipDone;
      });
      // The superseded image response lands now and must leave the chip set alone.
      await act(async () => {
        image.resolve(ok({ products: [], facets, meta: { ...meta, appliedFilters: {} } }));
        await imageDone;
      });
      await act(async () => {
        const refineDone = result.current.refine?.("cheaper");
        await Promise.resolve();
        respond("/search", { color: "red", size: "M" });
        await refineDone;
      });

      const lastRefine = JSON.parse(
        (fetchMock.mock.calls.at(-1)?.[1] as { body: string }).body,
      ) as Record<string, unknown>;
      expect(lastRefine.facetSelections).toEqual({ size: ["M"] });
    });
  });

  it("pending requests and timers are aborted on unmount", async () => {
    vi.useFakeTimers();
    const { fetchMock, next } = stubManualFetch();
    const { result, unmount } = renderHook(() =>
      useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai", debounceMs: 250 }),
    );

    // An in-flight text search...
    let textDone!: Promise<void>;
    act(() => {
      textDone = result.current.search("red shoes");
    });
    const text = next("/search");
    // ...and a debounced search that has not fired yet.
    act(() => {
      result.current.setQuery("blue boots");
    });
    expect(text.init.signal?.aborted).toBe(false);

    unmount();

    expect(text.init.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    text.resolve(ok({ products: [], meta }));
    await textDone;
  });

  it("aborts an in-flight image search and a pending suggestions request on unmount", async () => {
    vi.useFakeTimers();
    const { fetchMock, next } = stubManualFetch();
    const { result, unmount } = renderHook(() =>
      useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai", enableAutocomplete: true }),
    );

    act(() => {
      void result.current.searchByImage(imageFile());
    });
    const image = next("/search/image");
    expect(image.init.signal?.aborted).toBe(false);
    act(() => {
      result.current.setQuery("red shoes");
    });

    unmount();

    expect(image.init.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe("reset while a search is in flight", () => {
    it.each([
      ["rejects with AbortError", true],
      ["still resolves", false],
    ])("clear() during a text search whose request %s leaves the widget empty", async (_name, rejectOnAbort) => {
      const { next } = stubManualFetch({ rejectOnAbort });
      const { result } = renderHook(() => useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai" }));

      let done!: Promise<void>;
      act(() => {
        done = result.current.search("red shoes");
      });
      const request = next("/search");
      act(() => {
        result.current.clear();
      });
      await act(async () => {
        request.resolve(ok({ products: [{ id: "late", name: "Late" }], meta }));
        await done;
      });

      expect(result.current.results).toEqual([]);
      expect(result.current.hasSearched).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it.each([
      ["rejects with AbortError", true],
      ["still resolves", false],
    ])("clear() during an image search whose request %s leaves the widget empty", async (_name, rejectOnAbort) => {
      const { next } = stubManualFetch({ rejectOnAbort });
      const { result } = renderHook(() => useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai" }));

      let done!: Promise<void>;
      act(() => {
        done = result.current.searchByImage(imageFile());
      });
      const request = next("/search/image");
      act(() => {
        result.current.clear();
      });
      expect(request.init.signal?.aborted).toBe(true);
      await act(async () => {
        request.resolve(ok({ products: [{ id: "late", name: "Late" }], interpretation: "boots", meta }));
        await done;
      });

      expect(result.current.results).toEqual([]);
      expect(result.current.query).toBe("");
      expect(result.current.hasSearched).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });
});
