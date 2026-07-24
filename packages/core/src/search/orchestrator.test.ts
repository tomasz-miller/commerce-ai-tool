import { afterEach, describe, expect, it, vi } from "vitest";
import { createSearchOrchestrator } from "./orchestrator.js";
import type { CommerceAIConfig } from "../types/index.js";
import type { CommercetoolsClient } from "../commercetools/client.js";
import {
  _resetLangfusePromptRuntimeForTests,
  _setLangfusePromptClientFactoryForTests,
  resolveSystemPrompt,
} from "../prompts/resolve.js";
import { SYSTEM_PROMPT_NAMES } from "../prompts/catalog.js";

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

    expect(ct.suggestSearchTerms).toHaveBeenCalledOnce();
    expect(ai.suggestSearchTerms).toHaveBeenCalledWith(
      "szukam stołu",
      { queryLocale: "pl", catalogLocale: "en" },
      8,
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

    const get = vi.fn().mockResolvedValue({
      prompt: "Orchestrator-managed prompt",
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
    expect(resolved.text).toBe("Orchestrator-managed prompt");
    expect(get).toHaveBeenCalledWith(
      SYSTEM_PROMPT_NAMES.TEXT_QUERY,
      expect.objectContaining({
        label: "staging",
        cacheTtlSeconds: 15,
      }),
    );
  });
});
