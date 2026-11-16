import { afterEach, describe, expect, it, vi } from "vitest";
import { createSearchOrchestrator, VoiceNotConfiguredError } from "./orchestrator.js";
import type { CommerceAIConfig } from "../types/index.js";
import type { CommercetoolsClient } from "../commercetools/client.js";
import { buildProductSearchRequest } from "../commercetools/query-builder.js";
import {
  _resetLangfusePromptRuntimeForTests,
  _setLangfusePromptClientFactoryForTests,
  resolveSystemPrompt,
} from "../prompts/resolve.js";
import { SYSTEM_PROMPT_NAMES, getLocalSystemPrompt } from "../prompts/catalog.js";

const baseConfig: CommerceAIConfig = {
  commercetools: {
    projectKey: "demo",
    clientId: "id",
    clientSecret: "secret",
    region: "europe-west1.gcp",
  },
  ai: {
    provider: "openrouter",
    openrouter: { apiKey: "test-key" },
  },
  defaults: {
    catalogLocale: "en",
    currency: "EUR",
    limit: 20,
  },
  cache: {
    ttlMs: 60_000,
    maxEntries: 100,
  },
};

function createMockCommercetoolsClient(
  overrides: Partial<CommercetoolsClient> = {},
): CommercetoolsClient {
  return {
    searchProducts: vi.fn().mockResolvedValue({
      productIds: [],
      total: 0,
      projections: [],
    }),
    listProductTypes: vi.fn().mockResolvedValue([]),
    getProductProjections: vi.fn().mockResolvedValue([]),
    suggestSearchTerms: vi.fn().mockResolvedValue(["Red Shoes", "Running Shoes"]),
    getCart: vi.fn().mockResolvedValue(null),
    getCustomerCart: vi.fn().mockResolvedValue(null),
    addToCart: vi.fn(),
    addItemsToCart: vi.fn(),
    removeLineItem: vi.fn(),
    changeLineItemQuantity: vi.fn(),
    loginAndMerge: vi.fn(),
    ...overrides,
  } as CommercetoolsClient;
}

describe("createSearchOrchestrator.suggestByText", () => {
  it("returns empty suggestions for short prefixes", async () => {
    const ct = createMockCommercetoolsClient();
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
    });

    const result = await orchestrator.suggestByText({ query: "a" });

    expect(result).toEqual({ suggestions: [] });
    expect(ct.suggestSearchTerms).not.toHaveBeenCalled();
  });

  it("delegates to commercetools and caches repeated requests", async () => {
    const ct = createMockCommercetoolsClient();
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
    });

    const first = await orchestrator.suggestByText({ query: "red" });
    const second = await orchestrator.suggestByText({ query: "red" });

    expect(first).toEqual({ suggestions: ["Red Shoes", "Running Shoes"] });
    expect(second).toEqual(first);
    expect(ct.suggestSearchTerms).toHaveBeenCalledTimes(1);
    expect(ct.suggestSearchTerms).toHaveBeenCalledWith("red", ["en"], 8);
  });

  it("uses catalog locale for suggestions when query locale differs", async () => {
    const ct = createMockCommercetoolsClient();
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
    });

    await orchestrator.suggestByText({
      query: "glass",
      catalogLocale: "en",
      queryLocale: "pl",
    });

    expect(ct.suggestSearchTerms).toHaveBeenCalledWith("glass", ["en", "pl"], 8);
  });

  it("clamps suggestion limits to a safe range", async () => {
    const ct = createMockCommercetoolsClient();
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
    });

    await orchestrator.suggestByText({ query: "red", limit: 0 });

    expect(ct.suggestSearchTerms).toHaveBeenCalledWith("red", ["en"], 1);
  });

  it("falls back to AI when CT is empty and locales differ", async () => {
    const ct = createMockCommercetoolsClient({
      suggestSearchTerms: vi.fn().mockResolvedValue([]),
    });
    const ai = {
      interpretTextQuery: vi.fn(),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn().mockResolvedValue(["wooden table", "wood table"]),
      summarizeVoiceResults: vi.fn(),
    };
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.suggestByText({
      query: "szukam stołu",
      queryLocale: "pl",
      catalogLocale: "en",
    });

    expect(ct.suggestSearchTerms).toHaveBeenCalledTimes(2);
    expect(ai.suggestSearchTerms).toHaveBeenCalledWith(
      "szukam stołu",
      { queryLocale: "pl", catalogLocale: "en" },
      8,
      expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
    );
    expect(result).toEqual({
      suggestions: ["wooden table", "wood table"],
      aiFallbackUsed: true,
    });
  });

  it("skips AI fallback for short same-locale tokens when CT is empty", async () => {
    const ct = createMockCommercetoolsClient({
      suggestSearchTerms: vi.fn().mockResolvedValue([]),
    });
    const ai = {
      interpretTextQuery: vi.fn(),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn(),
      summarizeVoiceResults: vi.fn(),
    };
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.suggestByText({
      query: "glas",
      queryLocale: "en",
      catalogLocale: "en",
    });

    expect(result).toEqual({ suggestions: [] });
    expect(ai.suggestSearchTerms).not.toHaveBeenCalled();
  });

  it("returns empty suggestions when AI fallback fails", async () => {
    const ct = createMockCommercetoolsClient({
      suggestSearchTerms: vi.fn().mockResolvedValue([]),
    });
    const ai = {
      interpretTextQuery: vi.fn(),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn().mockRejectedValue(new Error("AI down")),
      summarizeVoiceResults: vi.fn(),
    };
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.suggestByText({
      query: "drewniany stol",
      queryLocale: "pl",
      catalogLocale: "en-GB",
    });

    expect(result).toEqual({ suggestions: [], aiFallbackUsed: true });
  });

  it("does not call AI when CT already returns suggestions", async () => {
    const ct = createMockCommercetoolsClient();
    const ai = {
      interpretTextQuery: vi.fn(),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn(),
      summarizeVoiceResults: vi.fn(),
    };
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.suggestByText({
      query: "glass",
      queryLocale: "pl",
      catalogLocale: "en",
    });

    expect(result.suggestions).toEqual(["Red Shoes", "Running Shoes"]);
    expect(ai.suggestSearchTerms).not.toHaveBeenCalled();
  });

  it("retries the last token when a multi-word prefix has no CT suggestions", async () => {
    const ct = createMockCommercetoolsClient({
      suggestSearchTerms: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          "Art Deco Coffee Table",
          "Minimalist Modern Side Table",
          "Modern Gold Coffee Table",
        ]),
    });
    const ai = {
      interpretTextQuery: vi.fn(),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn(),
      summarizeVoiceResults: vi.fn(),
    };
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.suggestByText({
      query: "coffee table",
      queryLocale: "en",
      catalogLocale: "en-GB",
    });

    expect(ct.suggestSearchTerms).toHaveBeenNthCalledWith(1, "coffee table", ["en-GB", "en"], 8);
    expect(ct.suggestSearchTerms).toHaveBeenNthCalledWith(2, "table", ["en-GB", "en"], 8);
    expect(ai.suggestSearchTerms).not.toHaveBeenCalled();
    expect(result).toEqual({
      suggestions: ["Art Deco Coffee Table", "Modern Gold Coffee Table"],
    });
  });

  it("falls back to AI when last-token hits omit earlier query words", async () => {
    const ct = createMockCommercetoolsClient({
      suggestSearchTerms: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(["White Running Shoes", "Blue Sneakers"]),
    });
    const ai = {
      interpretTextQuery: vi.fn(),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn().mockResolvedValue(["red shoes"]),
      summarizeVoiceResults: vi.fn(),
    };
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.suggestByText({
      query: "red shoes",
      queryLocale: "en",
      catalogLocale: "en",
    });

    expect(ct.suggestSearchTerms).toHaveBeenNthCalledWith(1, "red shoes", ["en"], 8);
    expect(ct.suggestSearchTerms).toHaveBeenNthCalledWith(2, "shoes", ["en"], 8);
    expect(ai.suggestSearchTerms).toHaveBeenCalledWith(
      "red shoes",
      { queryLocale: "en", catalogLocale: "en" },
      8,
      expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
    );
    expect(result).toEqual({
      suggestions: ["red shoes"],
      aiFallbackUsed: true,
    });
  });
});

describe("createSearchOrchestrator.searchByText facets", () => {
  function createMockAi() {
    return {
      interpretTextQuery: vi.fn().mockResolvedValue({
        searchTerms: ["glasses"],
        interpretation: "glasses",
        filters: {},
        suggestedFacets: [{ name: "color" }],
      }),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn(),
      summarizeForTts: vi.fn(),
    };
  }

  it("passes suggestedFacets on chip refine and skips AI", async () => {
    const ct = createMockCommercetoolsClient({
      listProductTypes: vi.fn().mockResolvedValue([
        {
          version: 1,
          attributes: [
            {
              name: "color",
              label: { en: "Color" },
              isSearchable: true,
              type: { name: "enum" },
            },
          ],
        },
      ]),
      searchProducts: vi.fn().mockResolvedValue({
        productIds: ["p1"],
        total: 1,
        projections: [{ id: "p1", name: "Red Glass" }],
        facets: [{ name: "color", buckets: [{ key: "red", count: 1 }] }],
      }),
    });
    const ai = createMockAi();
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, facets: { enabled: true } },
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByText({
      query: "glasses",
      searchTerms: ["glasses"],
      filters: { color: "red" },
      suggestedFacets: [{ name: "color" }],
      includeFacets: true,
    });

    expect(ai.interpretTextQuery).not.toHaveBeenCalled();
    expect(ai.interpretRefineQuery).not.toHaveBeenCalled();
    expect(result.suggestedFacets).toEqual([{ name: "color" }]);
    expect(result.facets?.[0]?.buckets).toEqual([{ key: "red", label: "red", count: 1 }]);
  });

  const colorAndBrandTypes = [
    {
      version: 1,
      attributes: [
        { name: "color", label: { en: "Color" }, isSearchable: true, type: { name: "enum" } },
        { name: "brand", label: { en: "Brand" }, isSearchable: true, type: { name: "text" } },
      ],
    },
  ];

  it("passes request.filters keys (facet chips) as postFilterKeys, not the LLM filter keys", async () => {
    const searchProducts = vi.fn().mockResolvedValue({ productIds: [], total: 0, projections: [] });
    const ct = createMockCommercetoolsClient({
      listProductTypes: vi.fn().mockResolvedValue(colorAndBrandTypes),
      searchProducts,
    });
    const ai = createMockAi();
    ai.interpretTextQuery.mockResolvedValue({
      searchTerms: ["glasses"],
      interpretation: "glasses",
      filters: { color: "red" },
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, facets: { enabled: true } },
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    await orchestrator.searchByText({ query: "red glasses", filters: { brand: "Acme" } });

    const input = searchProducts.mock.calls[0]?.[0];
    expect(input.interpreted.filters).toEqual({ color: "red", brand: "Acme" });
    expect(input.postFilterKeys).toEqual(["brand"]);
  });

  it("a chip request whose echoed filters include a variant-level key keeps that key in query", async () => {
    const searchProducts = vi.fn().mockResolvedValue({ productIds: [], total: 0, projections: [] });
    const ct = createMockCommercetoolsClient({
      listProductTypes: vi.fn().mockResolvedValue(colorAndBrandTypes),
      searchProducts,
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, facets: { enabled: true } },
      commercetoolsClient: ct,
      aiProvider: createMockAi() as never,
    });

    // A chip click echoes the previous meta.appliedFilters: the model's color plus the chip.
    await orchestrator.searchByText({
      query: "red glasses",
      searchTerms: ["glasses"],
      filters: { color: "red", category: "cat-1" },
      suggestedFacets: [{ name: "color" }, { name: "categories" }],
    });

    const body = buildProductSearchRequest(searchProducts.mock.calls[0]?.[0]);
    expect(JSON.stringify(body.query)).toContain("variants.attributes.color");
    expect(body.postFilter).toEqual({
      exact: { field: "categories", value: "cat-1", caseInsensitive: true },
    });
  });

  it("without facetSelections only categories go to postFilter", async () => {
    const searchProducts = vi.fn().mockResolvedValue({ productIds: [], total: 0, projections: [] });
    const ct = createMockCommercetoolsClient({
      listProductTypes: vi.fn().mockResolvedValue(colorAndBrandTypes),
      searchProducts,
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, facets: { enabled: true } },
      commercetoolsClient: ct,
      aiProvider: createMockAi() as never,
    });

    await orchestrator.searchByText({
      query: "glasses",
      searchTerms: ["glasses"],
      filters: { color: "red", brand: "Acme", category: "cat-1" },
      suggestedFacets: [{ name: "color" }, { name: "brand" }, { name: "categories" }],
    });

    const input = searchProducts.mock.calls[0]?.[0];
    expect(input.postFilterAllGroups).toBeFalsy();
    const body = buildProductSearchRequest(input);
    expect(JSON.stringify(body.query)).toContain("variants.attributes.color");
    expect(JSON.stringify(body.query)).toContain("variants.attributes.brand");
    expect(body.postFilter).toEqual({
      exact: { field: "categories", value: "cat-1", caseInsensitive: true },
    });
  });

  it("an empty facetSelections object is a new-style request with no chips, unlike an absent field", async () => {
    const searchProducts = vi.fn().mockResolvedValue({
      productIds: ["p1"],
      total: 1,
      projections: [{ id: "p1", name: "Red Glass" }],
    });
    const ct = createMockCommercetoolsClient({
      listProductTypes: vi.fn().mockResolvedValue(colorAndBrandTypes),
      searchProducts,
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, facets: { enabled: true }, cache: { ttlMs: 60_000 } },
      commercetoolsClient: ct,
      aiProvider: createMockAi() as never,
    });
    const request = {
      query: "glasses",
      searchTerms: ["glasses"],
      filters: { color: "red", category: "cat-1" },
      suggestedFacets: [{ name: "color" }, { name: "categories" }],
    };

    await orchestrator.searchByText(request);
    await orchestrator.searchByText({ ...request, facetSelections: {} });
    await orchestrator.searchByText({ ...request, facetSelections: {} });

    // Absent: the categories group is a chip. `{}`: nothing is, so the category stays in query.
    const absent = searchProducts.mock.calls[0]?.[0];
    const empty = searchProducts.mock.calls[1]?.[0];
    expect(buildProductSearchRequest(absent).postFilter).toEqual({
      exact: { field: "categories", value: "cat-1", caseInsensitive: true },
    });
    expect(empty.postFilterKeys).toBeUndefined(); // no chip keys are passed to the builder
    const emptyBody = buildProductSearchRequest(empty);
    expect(emptyBody.postFilter).toBeUndefined();
    expect(JSON.stringify(emptyBody.query)).toContain("categories");
    // Distinct cache keys: absent and `{}` never share a result, `{}` twice does.
    expect(searchProducts).toHaveBeenCalledTimes(2);
  });

  it("facetSelections route every chip group to postFilter", async () => {
    const searchProducts = vi.fn().mockResolvedValue({ productIds: [], total: 0, projections: [] });
    const ct = createMockCommercetoolsClient({
      listProductTypes: vi.fn().mockResolvedValue(colorAndBrandTypes),
      searchProducts,
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, facets: { enabled: true } },
      commercetoolsClient: ct,
      aiProvider: createMockAi() as never,
    });

    // The widget echoes meta.appliedFilters as `filters`: the model's brand and the chips
    // color and category. Only the groups named in facetSelections are chips.
    await orchestrator.searchByText({
      query: "glasses",
      searchTerms: ["glasses"],
      filters: { color: "red", brand: "Acme", category: "cat-1" },
      facetSelections: { color: ["red"], categories: ["cat-1"] },
      suggestedFacets: [{ name: "color" }, { name: "brand" }, { name: "categories" }],
    });

    const input = searchProducts.mock.calls[0]?.[0];
    expect([...input.postFilterKeys].sort()).toEqual(["category", "color"]);
    expect(input.postFilterAllGroups).toBe(true);
    const body = buildProductSearchRequest(input);
    expect(JSON.stringify(body.query)).toContain("variants.attributes.brand");
    expect(JSON.stringify(body.query)).not.toContain("variants.attributes.color");
    const postFilter = JSON.stringify(body.postFilter);
    expect(postFilter).toContain("variants.attributes.color.key");
    expect(postFilter).toContain('"categories"');
  });

  it("a facetSelections chip the refine model overrode is not a chip", async () => {
    const searchProducts = vi.fn().mockResolvedValue({ productIds: [], total: 0, projections: [] });
    const ct = createMockCommercetoolsClient({
      listProductTypes: vi.fn().mockResolvedValue(colorAndBrandTypes),
      searchProducts,
    });
    const ai = createMockAi();
    ai.interpretRefineQuery.mockResolvedValue({
      searchTerms: ["glasses"],
      interpretation: "blue glasses",
      filters: { color: "blue" },
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, facets: { enabled: true } },
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    await orchestrator.searchByText({
      query: "glasses",
      searchTerms: ["glasses"],
      filters: { color: "red", brand: "Acme" },
      facetSelections: { color: ["red"], brand: ["Acme"] },
      refineQuery: "make it blue",
    });

    expect(searchProducts.mock.calls[0]?.[0].postFilterKeys).toEqual(["brand"]);
  });

  it("does not share cached results between requests with and without facetSelections", async () => {
    const searchProducts = vi.fn().mockResolvedValue({
      productIds: ["p1"],
      total: 1,
      projections: [{ id: "p1", name: "Red Glass" }],
    });
    const ct = createMockCommercetoolsClient({
      listProductTypes: vi.fn().mockResolvedValue(colorAndBrandTypes),
      searchProducts,
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, facets: { enabled: true }, cache: { ttlMs: 60_000 } },
      commercetoolsClient: ct,
      aiProvider: createMockAi() as never,
    });
    const request = {
      query: "glasses",
      searchTerms: ["glasses"],
      filters: { color: "red" },
      suggestedFacets: [{ name: "color" }],
    };

    await orchestrator.searchByText(request);
    await orchestrator.searchByText({ ...request, facetSelections: { color: ["red"] } });
    await orchestrator.searchByText({ ...request, facetSelections: { color: ["red"] } });

    expect(searchProducts).toHaveBeenCalledTimes(2);
  });

  it("keeps a refine-query constraint from the LLM in query", async () => {
    const searchProducts = vi.fn().mockResolvedValue({ productIds: [], total: 0, projections: [] });
    const ct = createMockCommercetoolsClient({
      listProductTypes: vi.fn().mockResolvedValue(colorAndBrandTypes),
      searchProducts,
    });
    const ai = createMockAi();
    ai.interpretRefineQuery.mockResolvedValue({
      searchTerms: ["glasses"],
      interpretation: "glasses by Acme",
      filters: { brand: "Acme" },
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, facets: { enabled: true } },
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    await orchestrator.searchByText({
      query: "glasses",
      searchTerms: ["glasses"],
      filters: { color: "red" },
      refineQuery: "only Acme",
    });

    expect(searchProducts.mock.calls[0]?.[0].postFilterKeys).toEqual(["color"]);
  });

  it("hydrates cards with the matched variant skus from Product Search", async () => {
    const getProductProjections = vi.fn().mockResolvedValue([{ id: "p1", name: "Red Glass" }]);
    const ct = createMockCommercetoolsClient({
      searchProducts: vi.fn().mockResolvedValue({
        productIds: ["p1"],
        total: 1,
        matchedSkus: { p1: "GLASS-RED" },
      }),
      getProductProjections,
    });
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: createMockAi() as never,
    });

    await orchestrator.searchByText({ query: "glasses" });

    expect(getProductProjections).toHaveBeenCalledWith(["p1"], "en", "EUR", undefined, {
      matchedSkus: { p1: "GLASS-RED" },
    });
  });

  it("category bucket label is the localized name", async () => {
    const getCategoryNames = vi.fn().mockResolvedValue({ "cat-1": "Glassware" });
    const ct = createMockCommercetoolsClient({
      listProductTypes: vi.fn().mockResolvedValue(colorAndBrandTypes),
      searchProducts: vi.fn().mockResolvedValue({
        productIds: ["p1"],
        total: 1,
        projections: [{ id: "p1", name: "Glass" }],
        facets: [
          {
            name: "categories",
            buckets: [
              { key: "cat-1", count: 1 },
              { key: "cat-2", count: 1 },
            ],
          },
        ],
      }),
      getCategoryNames,
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, facets: { enabled: true } },
      commercetoolsClient: ct,
      aiProvider: createMockAi() as never,
    });

    const result = await orchestrator.searchByText({
      query: "glasses",
      searchTerms: ["glasses"],
      suggestedFacets: [{ name: "categories" }],
    });

    expect(getCategoryNames).toHaveBeenCalledWith(["cat-1", "cat-2"], "en");
    expect(result.facets?.[0]?.buckets).toEqual([
      { key: "cat-1", label: "Glassware", count: 1 },
      { key: "cat-2", label: "cat-2", count: 1 },
    ]);
  });

  it("falls back to category ids when the name lookup fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ct = createMockCommercetoolsClient({
      listProductTypes: vi.fn().mockResolvedValue(colorAndBrandTypes),
      searchProducts: vi.fn().mockResolvedValue({
        productIds: ["p1"],
        total: 1,
        projections: [{ id: "p1", name: "Glass" }],
        facets: [{ name: "categories", buckets: [{ key: "cat-1", count: 1 }] }],
      }),
      getCategoryNames: vi.fn().mockRejectedValue(new Error("down")),
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, facets: { enabled: true } },
      commercetoolsClient: ct,
      aiProvider: createMockAi() as never,
    });

    const result = await orchestrator.searchByText({
      query: "glasses",
      searchTerms: ["glasses"],
      suggestedFacets: [{ name: "categories" }],
    });

    expect(result.facets?.[0]?.buckets).toEqual([{ key: "cat-1", label: "cat-1", count: 1 }]);
    warn.mockRestore();
  });

  it("does not reuse a non-facet cache entry for a facet-enabled request", async () => {
    const searchProducts = vi.fn().mockResolvedValue({
      productIds: ["p1"],
      total: 1,
      projections: [{ id: "p1", name: "Glasses" }],
    });
    const ct = createMockCommercetoolsClient({ searchProducts });
    const ai = createMockAi();
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    await orchestrator.searchByText({ query: "glasses", includeFacets: false });
    await orchestrator.searchByText({ query: "glasses", includeFacets: true });

    expect(searchProducts).toHaveBeenCalledTimes(2);
  });
});

describe("createSearchOrchestrator.searchByText query passthrough", () => {
  it("searches the typed query when AI returns no searchTerms", async () => {
    const searchProducts = vi.fn().mockResolvedValue({
      productIds: ["p1"],
      total: 1,
      projections: [{ id: "p1", name: "Art Deco Coffee Table" }],
    });
    const ct = createMockCommercetoolsClient({ searchProducts });
    const ai = {
      interpretTextQuery: vi.fn().mockResolvedValue({
        searchTerms: [],
        interpretation: "none",
        filters: {},
      }),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn(),
      summarizeVoiceResults: vi.fn(),
    };
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByText({
      query: "coffee table",
      queryLocale: "en",
      catalogLocale: "en-GB",
    });

    expect(searchProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        interpreted: expect.objectContaining({ searchTerms: ["coffee table"] }),
      }),
      expect.anything(),
    );
    expect(result.meta.searchTerms).toEqual(["coffee table"]);
  });

  it("prepends the typed query when AI already returned phrases", async () => {
    const searchProducts = vi.fn().mockResolvedValue({
      productIds: ["p1"],
      total: 1,
      projections: [{ id: "p1", name: "Art Deco Coffee Table" }],
    });
    const ct = createMockCommercetoolsClient({ searchProducts });
    const ai = {
      interpretTextQuery: vi.fn().mockResolvedValue({
        searchTerms: ["side table"],
        interpretation: "tables",
        filters: {},
      }),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn(),
      summarizeVoiceResults: vi.fn(),
    };
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByText({
      query: "coffee table",
      queryLocale: "en",
      catalogLocale: "en-GB",
    });

    expect(searchProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        interpreted: expect.objectContaining({
          searchTerms: ["coffee table", "side table"],
        }),
      }),
      expect.anything(),
    );
    expect(result.meta.searchTerms).toEqual(["coffee table", "side table"]);
  });

  it("does not search off-topic questions when AI returns no terms", async () => {
    const searchProducts = vi.fn();
    const ct = createMockCommercetoolsClient({ searchProducts });
    const ai = {
      interpretTextQuery: vi.fn().mockResolvedValue({
        searchTerms: [],
        interpretation: "not product search",
        filters: {},
      }),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn(),
      summarizeVoiceResults: vi.fn(),
    };
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    await orchestrator.searchByText({
      query: "explain the difference between RAM and SSD",
      queryLocale: "en",
      catalogLocale: "en-GB",
    });

    expect(searchProducts).not.toHaveBeenCalled();
  });
});

describe("createSearchOrchestrator zero-result relaxation", () => {
  it("drops soft filters then retries with primaryTerm mustMatch any", async () => {
    const searchProducts = vi
      .fn()
      .mockResolvedValueOnce({ productIds: [], total: 0, projections: [] })
      .mockResolvedValueOnce({ productIds: [], total: 0, projections: [] })
      .mockResolvedValueOnce({
        productIds: ["p1"],
        total: 1,
        projections: [{ id: "p1", name: "Wine Glass" }],
      });
    const ct = createMockCommercetoolsClient({ searchProducts });
    const ai = {
      interpretTextQuery: vi.fn().mockResolvedValue({
        primaryTerm: "wine glass",
        searchTerms: ["wine glass", "glass"],
        filters: { color: "red", priceMax: "40" },
        interpretation: "red wine glasses",
      }),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn(),
      summarizeVoiceResults: vi.fn(),
    };
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByText({
      query: "czerwony kieliszek do wina",
      queryLocale: "pl",
      catalogLocale: "en-GB",
    });

    expect(searchProducts).toHaveBeenCalledTimes(3);
    expect(searchProducts.mock.calls[1]?.[0].interpreted.filters).toEqual({ priceMax: "40" });
    expect(searchProducts.mock.calls[2]?.[0].interpreted.searchTerms).toEqual(["wine glass"]);
    expect(searchProducts.mock.calls[2]?.[0].interpreted.filters).toEqual({ priceMax: "40" });
    expect(searchProducts.mock.calls[2]?.[0].options?.mustMatch).toBe("any");
    expect(result.meta.relaxation).toBe("primary_any_match");
    expect(result.products).toHaveLength(1);
  });

  it("applies the same zero-result retries when paginating past offset 0", async () => {
    const searchProducts = vi
      .fn()
      .mockResolvedValueOnce({ productIds: [], total: 0, projections: [] })
      .mockResolvedValueOnce({
        productIds: ["p2"],
        total: 12,
        projections: [{ id: "p2", name: "Wine Glass page 2" }],
      });
    const ct = createMockCommercetoolsClient({ searchProducts });
    const ai = {
      interpretTextQuery: vi.fn().mockResolvedValue({
        primaryTerm: "wine glass",
        searchTerms: ["wine glass"],
        filters: { priceMax: "40" },
        interpretation: "wine glasses",
      }),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn(),
      summarizeVoiceResults: vi.fn(),
    };
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByText({
      query: "wine glass",
      queryLocale: "en",
      catalogLocale: "en-GB",
      offset: 10,
    });

    expect(searchProducts).toHaveBeenCalledTimes(2);
    expect(searchProducts.mock.calls[1]?.[0].offset).toBe(10);
    expect(searchProducts.mock.calls[1]?.[0].options?.mustMatch).toBe("any");
    expect(result.meta.relaxation).toBe("primary_any_match");
    expect(result.meta.total).toBe(12);
    expect(result.products).toHaveLength(1);
  });
});

describe("createSearchOrchestrator with Langfuse disabled", () => {
  it("returns search results without requiring OTel setup", async () => {
    const ct = createMockCommercetoolsClient({
      searchProducts: vi.fn().mockResolvedValue({
        productIds: ["p1"],
        total: 1,
        projections: [{ id: "p1", name: "Shoe" }],
      }),
    });
    const ai = {
      interpretTextQuery: vi.fn().mockResolvedValue({
        searchTerms: ["shoe"],
        interpretation: "shoe",
      }),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      summarizeVoiceResults: vi.fn(),
    };
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByText({ query: "shoe" });
    expect(result.products).toEqual([{ id: "p1", name: "Shoe" }]);
    expect(result.meta.total).toBe(1);
    expect(result.meta.traceId).toBeUndefined();
    expect(ai.interpretTextQuery).toHaveBeenCalledOnce();
  });
});

describe("createSearchOrchestrator Langfuse prompt config", () => {
  afterEach(() => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PROMPTS;
    _resetLangfusePromptRuntimeForTests();
  });

  it("applies config.langfuse via configureLangfusePrompts", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    // Env alone would leave prompts off; orchestrator config must enable them.
    delete process.env.LANGFUSE_PROMPTS;

    // Managed text must keep the required safety markers, so extend the local prompt.
    const managedText = `${getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY)}\nOrchestrator-managed prompt`;
    const get = vi.fn().mockResolvedValue({
      prompt: managedText,
      isFallback: false,
    });
    _setLangfusePromptClientFactoryForTests(() => ({ prompt: { get } }) as never);

    createSearchOrchestrator({
      config: {
        ...baseConfig,
        langfuse: {
          promptsEnabled: true,
          promptLabel: "staging",
          promptCacheTtlSeconds: 15,
        },
      },
      commercetoolsClient: createMockCommercetoolsClient(),
      aiProvider: {
        interpretTextQuery: vi.fn(),
        interpretRefineQuery: vi.fn(),
        interpretImageQuery: vi.fn(),
        interpretVoiceAudio: vi.fn(),
        enhanceVoiceTranscript: vi.fn(),
        suggestSearchTerms: vi.fn(),
        summarizeVoiceResults: vi.fn(),
      } as never,
    });

    const resolved = await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
    expect(resolved.source).toBe("langfuse");
    expect(resolved.text).toBe(managedText);
    expect(get).toHaveBeenCalledWith(
      SYSTEM_PROMPT_NAMES.TEXT_QUERY,
      expect.objectContaining({
        label: "staging",
        cacheTtlSeconds: 15,
      }),
    );
  });
});

describe("createSearchOrchestrator image and voice catalog", () => {
  const colorProductType = {
    version: 1,
    attributes: [
      {
        name: "color",
        label: { en: "Color" },
        isSearchable: true,
        type: { name: "enum" },
      },
    ],
  };

  it("passes the attribute catalog to image interpretation without exposing facets when facets are off", async () => {
    const ct = createMockCommercetoolsClient({
      listProductTypes: vi.fn().mockResolvedValue([colorProductType]),
      searchProducts: vi.fn().mockResolvedValue({
        productIds: ["p1"],
        total: 1,
        projections: [{ id: "p1", name: "Red Glass" }],
      }),
    });
    const ai = {
      interpretTextQuery: vi.fn(),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn().mockResolvedValue({
        searchTerms: ["wine glass"],
        interpretation: "a wine glass",
        filters: {},
      }),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn(),
      summarizeVoiceResults: vi.fn(),
    };
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByImage(new Uint8Array([1]), "image/jpeg");

    expect(ai.interpretImageQuery).toHaveBeenCalledWith(
      expect.any(String),
      "image/jpeg",
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ name: "color" })]),
      expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
    );
    expect(result.facetSchema).toBeUndefined();
    expect(result.facets).toBeUndefined();
  });

  it("caps a 900-char LLM voice summary at MAX_TTS_CHARS on a sentence or word boundary", async () => {
    const ct = createMockCommercetoolsClient({
      searchProducts: vi.fn().mockResolvedValue({
        productIds: ["p1"],
        total: 1,
        projections: [{ id: "p1", name: "Red Glass" }],
      }),
    });
    const summary = "I found one red glass that matches what you asked for today. ".repeat(15).trim();
    expect(summary.length).toBeGreaterThan(900);
    const ai = {
      interpretTextQuery: vi.fn(),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn().mockResolvedValue({
        transcript: "red glass",
        enhancedQuery: "red glass",
        searchTerms: ["red glass"],
        interpretation: "red glass",
        filters: {},
      }),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn(),
      summarizeVoiceResults: vi.fn().mockResolvedValue(summary),
    };
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, cache: undefined, voice: { llmSummary: true } },
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByVoice(new Uint8Array([1]), "audio/webm");

    expect(ai.summarizeVoiceResults).toHaveBeenCalled();
    expect(result.ttsText).toBeDefined();
    expect(result.ttsText!.length).toBeLessThanOrEqual(500);
    expect(summary.startsWith(result.ttsText!)).toBe(true);
    expect(/[.!?]$/.test(result.ttsText!) || summary.charAt(result.ttsText!.length) === " ").toBe(true);
  });

  it("passes the attribute catalog to direct voice interpretation", async () => {
    const ct = createMockCommercetoolsClient({
      listProductTypes: vi.fn().mockResolvedValue([colorProductType]),
      searchProducts: vi.fn().mockResolvedValue({
        productIds: ["p1"],
        total: 1,
        projections: [{ id: "p1", name: "Red Glass" }],
      }),
    });
    const ai = {
      interpretTextQuery: vi.fn(),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn().mockResolvedValue({
        transcript: "red glass",
        enhancedQuery: "red glass",
        searchTerms: ["red glass"],
        interpretation: "red glass",
        filters: {},
      }),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn(),
      summarizeVoiceResults: vi.fn(),
    };
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    await orchestrator.searchByVoice(new Uint8Array([1]), "audio/webm", { enableTts: false });

    expect(ai.interpretVoiceAudio).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "audio/webm",
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ name: "color" })]),
      expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
    );
  });
});

describe("searchByVoice without a voice backend", () => {
  it("throws VoiceNotConfiguredError in elevenlabs-stt mode without a transcribeAudio dependency", async () => {
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, cache: undefined, voiceMode: "elevenlabs-stt" },
      commercetoolsClient: createMockCommercetoolsClient(),
      aiProvider: {
        interpretTextQuery: vi.fn(),
        interpretRefineQuery: vi.fn(),
        interpretImageQuery: vi.fn(),
        interpretVoiceAudio: vi.fn(),
        enhanceVoiceTranscript: vi.fn(),
        suggestSearchTerms: vi.fn(),
        summarizeVoiceResults: vi.fn(),
      } as never,
    });

    await expect(orchestrator.searchByVoice(new Uint8Array([1]), "audio/webm")).rejects.toBeInstanceOf(
      VoiceNotConfiguredError,
    );
  });
});

describe("createSearchOrchestrator abort signal", () => {
  function createAi() {
    return {
      interpretTextQuery: vi.fn(),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn(),
      summarizeVoiceResults: vi.fn(),
      decomposeShoppingMission: vi.fn(),
    };
  }

  it("threads the request signal into the AI call and aborts it with the request", async () => {
    const ai = createAi();
    let aiSignal: AbortSignal | undefined;
    ai.interpretTextQuery.mockImplementation(
      (_text: string, _locales: unknown, _catalog: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          aiSignal = options?.signal;
          options?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const ct = createMockCommercetoolsClient();
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, cache: undefined },
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });
    const request = new AbortController();
    const reason = new DOMException("client closed", "AbortError");

    const pending = orchestrator.searchByText({ query: "hat", signal: request.signal });
    await vi.waitFor(() => expect(aiSignal).toBeInstanceOf(AbortSignal));
    expect(aiSignal?.aborted).toBe(false);
    request.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(aiSignal?.aborted).toBe(true);
    expect(ct.searchProducts).not.toHaveBeenCalled();
  });

  it("gives AI suggestions a signal too", async () => {
    const ai = createAi();
    ai.suggestSearchTerms.mockResolvedValue(["wooden table"]);
    const ct = createMockCommercetoolsClient({ suggestSearchTerms: vi.fn().mockResolvedValue([]) });
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    await orchestrator.suggestByText({ query: "szukam stołu", queryLocale: "pl", catalogLocale: "en" });

    expect(ai.suggestSearchTerms).toHaveBeenCalledWith(
      "szukam stołu",
      { queryLocale: "pl", catalogLocale: "en" },
      8,
      expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
    );
  });
});

function createCountingAi(overrides: Record<string, unknown> = {}) {
  const ai = {
    interpretTextQuery: vi.fn().mockResolvedValue({
      searchTerms: ["red shoes"],
      interpretation: "red shoes",
      filters: {},
    }),
    interpretRefineQuery: vi.fn(),
    interpretImageQuery: vi.fn().mockResolvedValue({
      searchTerms: ["red shoes"],
      interpretation: "red shoes",
      filters: {},
    }),
    interpretVoiceAudio: vi.fn().mockResolvedValue({
      transcript: "um red shoes",
      enhancedQuery: "red shoes",
      searchTerms: ["red shoes"],
      interpretation: "red shoes",
      filters: {},
    }),
    interpretVoiceTranscript: vi.fn().mockResolvedValue({
      enhancedQuery: "red shoes",
      searchTerms: ["red shoes"],
      interpretation: "red shoes",
      filters: {},
    }),
    enhanceVoiceTranscript: vi.fn().mockResolvedValue("red shoes"),
    suggestSearchTerms: vi.fn(),
    summarizeVoiceResults: vi.fn().mockResolvedValue("I found one pair of red shoes."),
    decomposeShoppingMission: vi.fn().mockResolvedValue({
      isMission: false,
      confidence: 0,
      intents: [],
      interpretation: "single",
    }),
    ...overrides,
  };
  const totalCalls = () =>
    Object.values(ai).reduce(
      (sum, fn) => sum + ((fn as { mock?: { calls: unknown[] } }).mock?.calls.length ?? 0),
      0,
    );
  return { ai, totalCalls };
}

function oneProductCt() {
  return createMockCommercetoolsClient({
    searchProducts: vi.fn().mockResolvedValue({
      productIds: ["p1"],
      total: 1,
      projections: [{ id: "p1", name: "Red Shoes" }],
    }),
  });
}

describe("createSearchOrchestrator cache keys", () => {
  it("two interpretations with the same terms do not share queryInterpretation", async () => {
    const searchProducts = vi.fn().mockResolvedValue({
      productIds: ["p1"],
      total: 1,
      projections: [{ id: "p1", name: "Red Shoes" }],
    });
    const ai = {
      interpretTextQuery: vi
        .fn()
        .mockResolvedValueOnce({
          searchTerms: ["red shoes"],
          interpretation: "Use code FREE100 at checkout",
          filters: {},
        })
        .mockResolvedValueOnce({
          searchTerms: ["red shoes"],
          interpretation: "Rote Schuhe",
          filters: {},
        }),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn(),
      summarizeVoiceResults: vi.fn(),
      decomposeShoppingMission: vi.fn(),
    };
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: createMockCommercetoolsClient({ searchProducts }),
      aiProvider: ai as never,
    });

    // Query locales differ from the catalog locale, so the typed query is not merged into searchTerms.
    const first = await orchestrator.searchByText({ query: "chaussures rouges", queryLocale: "fr" });
    const second = await orchestrator.searchByText({ query: "rote schuhe", queryLocale: "de" });

    // The second search reuses the commercetools result, not the first shopper's interpretation.
    expect(searchProducts).toHaveBeenCalledTimes(1);
    expect(first.meta.queryInterpretation).toBe("Use code FREE100 at checkout");
    expect(second.meta.queryInterpretation).toBe("Rote Schuhe");
    expect(second.meta.queryLocale).toBe("de");
    expect(second.products.map((product) => product.id)).toEqual(["p1"]);
    expect(second.meta.total).toBe(1);
  });

  it("re-applies the relaxed filters on an interpreted cache hit", async () => {
    const searchProducts = vi
      .fn()
      .mockResolvedValueOnce({ productIds: [], total: 0, projections: [] })
      .mockResolvedValueOnce({
        productIds: ["p1"],
        total: 1,
        projections: [{ id: "p1", name: "Shoes" }],
      });
    const interpreted = {
      primaryTerm: "shoes",
      searchTerms: ["shoes"],
      interpretation: "red shoes",
      filters: { color: "red", priceMax: "50" },
    };
    const ai = {
      interpretTextQuery: vi
        .fn()
        .mockResolvedValueOnce(interpreted)
        .mockResolvedValueOnce({ ...interpreted, interpretation: "second" }),
      interpretRefineQuery: vi.fn(),
      interpretImageQuery: vi.fn(),
      interpretVoiceAudio: vi.fn(),
      enhanceVoiceTranscript: vi.fn(),
      suggestSearchTerms: vi.fn(),
      summarizeVoiceResults: vi.fn(),
      decomposeShoppingMission: vi.fn(),
    };
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: createMockCommercetoolsClient({ searchProducts }),
      aiProvider: ai as never,
    });

    const first = await orchestrator.searchByText({ query: "rote Schuhe bis 50", queryLocale: "de" });
    const second = await orchestrator.searchByText({ query: "rote Schuhe unter 50", queryLocale: "de" });

    expect(searchProducts).toHaveBeenCalledTimes(2);
    expect(first.meta.relaxation).toBe("drop_soft_filters");
    expect(second.meta.relaxation).toBe("drop_soft_filters");
    expect(second.meta.appliedFilters).toEqual(first.meta.appliedFilters);
    expect(second.meta.appliedFilters).toEqual({ priceMax: "50" });
    expect(second.meta.queryInterpretation).toBe("second");
  });

  it("requests differing only by sort both reach commercetools", async () => {
    const searchProducts = vi.fn().mockResolvedValue({
      productIds: ["p1"],
      total: 1,
      projections: [{ id: "p1", name: "Shoes" }],
    });
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: createMockCommercetoolsClient({ searchProducts }),
      aiProvider: createCountingAi().ai as never,
    });

    const asc = await orchestrator.searchByText({
      query: "shoes",
      searchTerms: ["shoes"],
      sort: "price_asc",
    });
    const desc = await orchestrator.searchByText({
      query: "shoes",
      searchTerms: ["shoes"],
      sort: "price_desc",
    });

    expect(searchProducts).toHaveBeenCalledTimes(2);
    expect(asc.meta.sort).toBe("price_asc");
    expect(desc.meta.sort).toBe("price_desc");
  });
});

describe("a single-product query makes exactly one LLM call", () => {
  const missionsOn = { ...baseConfig, cache: undefined, missions: { enabled: true } };

  it("text", async () => {
    const { ai, totalCalls } = createCountingAi();
    const orchestrator = createSearchOrchestrator({
      config: missionsOn,
      commercetoolsClient: oneProductCt(),
      aiProvider: ai as never,
    });

    await orchestrator.searchByText({ query: "red shoes" });

    expect(ai.interpretTextQuery).toHaveBeenCalledOnce();
    expect(totalCalls()).toBe(1);
  });

  it("voice through ElevenLabs STT, with TTS", async () => {
    const { ai, totalCalls } = createCountingAi();
    const transcribeAudio = vi.fn().mockResolvedValue("red shoes");
    const orchestrator = createSearchOrchestrator({
      config: { ...missionsOn, voiceMode: "elevenlabs-stt" },
      commercetoolsClient: oneProductCt(),
      aiProvider: ai as never,
      transcribeAudio,
    });

    const result = await orchestrator.searchByVoice(new Uint8Array([1]), "audio/webm");

    expect(transcribeAudio).toHaveBeenCalledOnce();
    expect(ai.interpretVoiceTranscript).toHaveBeenCalledWith(
      "red shoes",
      expect.anything(),
      expect.any(Array),
      expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
    );
    expect(totalCalls()).toBe(1);
    expect(result.transcript).toBe("red shoes");
    expect(result.enhancedQuery).toBe("red shoes");
    expect(result.ttsText).toBeTruthy();
  });

  it("voice through OpenRouter audio, with TTS", async () => {
    // A transcript of three or more words passes the mission gate (fail open), so keep it short.
    const { ai, totalCalls } = createCountingAi({
      interpretVoiceAudio: vi.fn().mockResolvedValue({
        transcript: "red shoes",
        enhancedQuery: "red shoes",
        searchTerms: ["red shoes"],
        interpretation: "red shoes",
        filters: {},
      }),
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...missionsOn, voiceMode: "openrouter-audio" },
      commercetoolsClient: oneProductCt(),
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByVoice(new Uint8Array([1]), "audio/webm");

    expect(ai.interpretVoiceAudio).toHaveBeenCalledOnce();
    expect(totalCalls()).toBe(1);
    expect(result.ttsText).toBeTruthy();
  });

  it("image", async () => {
    const { ai, totalCalls } = createCountingAi();
    const orchestrator = createSearchOrchestrator({
      config: missionsOn,
      commercetoolsClient: oneProductCt(),
      aiProvider: ai as never,
    });

    await orchestrator.searchByImage(new Uint8Array([1]), "image/jpeg");

    expect(ai.interpretImageQuery).toHaveBeenCalledOnce();
    expect(totalCalls()).toBe(1);
  });
});

describe("voice ElevenLabs transcript interpretation", () => {
  it("falls back to enhance then interpret when the provider has no interpretVoiceTranscript", async () => {
    const { ai } = createCountingAi();
    const { interpretVoiceTranscript: _omit, ...legacyAi } = ai;
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, cache: undefined, voiceMode: "elevenlabs-stt" },
      commercetoolsClient: oneProductCt(),
      aiProvider: legacyAi as never,
      transcribeAudio: vi.fn().mockResolvedValue("um red shoes"),
    });

    const result = await orchestrator.searchByVoice(new Uint8Array([1]), "audio/webm", {
      enableTts: false,
    });

    expect(ai.enhanceVoiceTranscript).toHaveBeenCalledOnce();
    expect(ai.interpretTextQuery).toHaveBeenCalledWith(
      "red shoes",
      expect.anything(),
      expect.any(Array),
      expect.anything(),
    );
    expect(result.enhancedQuery).toBe("red shoes");
  });

  it("uses the transcript when the merged call returns an empty enhancedQuery", async () => {
    const { ai } = createCountingAi({
      interpretVoiceTranscript: vi.fn().mockResolvedValue({
        enhancedQuery: "",
        searchTerms: ["red shoes"],
        interpretation: "red shoes",
        filters: {},
      }),
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, cache: undefined, voiceMode: "elevenlabs-stt" },
      commercetoolsClient: oneProductCt(),
      aiProvider: ai as never,
      transcribeAudio: vi.fn().mockResolvedValue("red shoes please"),
    });

    const result = await orchestrator.searchByVoice(new Uint8Array([1]), "audio/webm", {
      enableTts: false,
    });

    expect(result.enhancedQuery).toBe("red shoes please");
  });
});

describe("voice TTS summary", () => {
  it("is deterministic by default", async () => {
    const { ai } = createCountingAi();
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, cache: undefined, voiceMode: "openrouter-audio" },
      commercetoolsClient: oneProductCt(),
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByVoice(new Uint8Array([1]), "audio/webm");

    expect(ai.summarizeVoiceResults).not.toHaveBeenCalled();
    expect(result.ttsText).toContain("Red Shoes");
  });

  it("calls the LLM when voice.llmSummary is true", async () => {
    const { ai } = createCountingAi();
    const orchestrator = createSearchOrchestrator({
      config: {
        ...baseConfig,
        cache: undefined,
        voiceMode: "openrouter-audio",
        voice: { llmSummary: true },
      },
      commercetoolsClient: oneProductCt(),
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByVoice(new Uint8Array([1]), "audio/webm");

    expect(ai.summarizeVoiceResults).toHaveBeenCalledOnce();
    expect(result.ttsText).toBe("I found one pair of red shoes.");
  });
});
