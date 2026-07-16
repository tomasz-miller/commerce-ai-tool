import { describe, expect, it, vi } from "vitest";
import { createSearchOrchestrator } from "./orchestrator.js";
import type { CommerceAIConfig } from "../types/index.js";
import type { CommercetoolsClient } from "../commercetools/client.js";

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
    ...overrides,
  };
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
    expect(ct.suggestSearchTerms).toHaveBeenCalledWith("red", "en", 8);
  });

  it("uses query locale for suggestions when it differs from catalog locale", async () => {
    const ct = createMockCommercetoolsClient();
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
    });

    await orchestrator.suggestByText({
      query: "red",
      catalogLocale: "no",
      queryLocale: "en",
    });

    expect(ct.suggestSearchTerms).toHaveBeenCalledWith("red", "en", 8);
  });

  it("clamps suggestion limits to a safe range", async () => {
    const ct = createMockCommercetoolsClient();
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
    });

    await orchestrator.suggestByText({ query: "red", limit: 0 });

    expect(ct.suggestSearchTerms).toHaveBeenCalledWith("red", "en", 1);
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

  it("does not reuse a non-facet cache entry for a facet-enabled request", async () => {
    const searchProducts = vi.fn().mockResolvedValue({
      productIds: [],
      total: 0,
      projections: [],
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
