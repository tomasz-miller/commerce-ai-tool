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
    suggestSearchTerms: vi.fn().mockResolvedValue([]),
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

function createMockAi(overrides: Record<string, unknown> = {}) {
  return {
    interpretTextQuery: vi.fn().mockResolvedValue({
      searchTerms: ["sports gear"],
      interpretation: "sports",
      filters: {},
    }),
    interpretRefineQuery: vi.fn(),
    interpretImageQuery: vi.fn(),
    interpretVoiceAudio: vi.fn(),
    enhanceVoiceTranscript: vi.fn(),
    suggestSearchTerms: vi.fn(),
    summarizeVoiceResults: vi.fn(),
    decomposeShoppingMission: vi.fn().mockResolvedValue({
      isMission: false,
      confidence: 0,
      intents: [],
      interpretation: "single",
    }),
    ...overrides,
  };
}

const twoIntents = {
  isMission: true,
  confidence: 0.9,
  interpretation: "racket and balls",
  intents: [
    { id: "intent-0", label: "tennis racket", quantity: 1, searchTerms: ["tennis racket"] },
    { id: "intent-1", label: "golf balls", quantity: 2, searchTerms: ["golf balls"] },
  ],
};

describe("createSearchOrchestrator.searchByText missions", () => {
  it("fans out bounded searches and groups results", async () => {
    const searchProducts = vi
      .fn()
      .mockResolvedValueOnce({
        productIds: ["p1"],
        total: 3,
        projections: [{ id: "p1", name: "Racket" }],
      })
      .mockResolvedValueOnce({
        productIds: ["p2"],
        total: 5,
        projections: [{ id: "p2", name: "Balls" }],
      });
    const ct = createMockCommercetoolsClient({ searchProducts });
    const ai = createMockAi({
      decomposeShoppingMission: vi.fn().mockResolvedValue(twoIntents),
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, missions: { enabled: true, perIntentLimit: 4 } },
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByText({
      query: "a tennis racket and two golf balls",
    });

    expect(ai.interpretTextQuery).toHaveBeenCalledOnce();
    expect(ai.decomposeShoppingMission).toHaveBeenCalledOnce();
    expect(searchProducts).toHaveBeenCalledTimes(2);
    expect(searchProducts).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        limit: 4,
        interpreted: expect.objectContaining({ searchTerms: ["tennis racket"] }),
      }),
      expect.anything(),
    );
    expect(result.mission?.intents).toHaveLength(2);
    expect(result.products.map((product) => product.id)).toEqual(["p1", "p2"]);
    expect(result.meta.total).toBe(8);
  });

  it("falls back to standard search when confidence is low", async () => {
    const searchProducts = vi.fn().mockResolvedValue({
      productIds: ["p1"],
      total: 1,
      projections: [{ id: "p1", name: "Sports" }],
    });
    const ct = createMockCommercetoolsClient({ searchProducts });
    const ai = createMockAi({
      decomposeShoppingMission: vi.fn().mockResolvedValue({
        ...twoIntents,
        confidence: 0.2,
      }),
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, missions: { enabled: true } },
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByText({
      query: "a tennis racket and two golf balls",
    });

    expect(searchProducts).toHaveBeenCalledTimes(1);
    expect(result.mission).toBeUndefined();
    expect(result.products[0]?.id).toBe("p1");
  });

  it("falls back when mission decomposition fails", async () => {
    const searchProducts = vi.fn().mockResolvedValue({
      productIds: ["p1"],
      total: 1,
      projections: [{ id: "p1", name: "Sports" }],
    });
    const ct = createMockCommercetoolsClient({ searchProducts });
    const ai = createMockAi({
      decomposeShoppingMission: vi.fn().mockRejectedValue(new Error("mission down")),
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, missions: { enabled: true } },
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByText({ query: "racket and balls" });

    expect(result.mission).toBeUndefined();
    expect(searchProducts).toHaveBeenCalledTimes(1);
  });

  it("keeps partial results when one intent search fails", async () => {
    const searchProducts = vi
      .fn()
      .mockResolvedValueOnce({
        productIds: ["p1"],
        total: 1,
        projections: [{ id: "p1", name: "Racket" }],
      })
      .mockRejectedValueOnce(new Error("timeout"));
    const ct = createMockCommercetoolsClient({ searchProducts });
    const ai = createMockAi({
      decomposeShoppingMission: vi.fn().mockResolvedValue(twoIntents),
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, missions: { enabled: true } },
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByText({ query: "racket and balls" });

    expect(result.mission?.intents[0]?.failed).toBeUndefined();
    expect(result.mission?.intents[1]?.failed).toBe(true);
    expect(result.products).toEqual([{ id: "p1", name: "Racket" }]);
  });

  it("falls back to standard search when every intent returns no products", async () => {
    const searchProducts = vi
      .fn()
      .mockResolvedValueOnce({ productIds: [], total: 0, projections: [] })
      .mockResolvedValueOnce({ productIds: [], total: 0, projections: [] })
      .mockResolvedValueOnce({
        productIds: ["p1"],
        total: 1,
        projections: [{ id: "p1", name: "Sports" }],
      });
    const ct = createMockCommercetoolsClient({ searchProducts });
    const ai = createMockAi({
      decomposeShoppingMission: vi.fn().mockResolvedValue(twoIntents),
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, missions: { enabled: true } },
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByText({ query: "racket and balls" });

    expect(searchProducts).toHaveBeenCalledTimes(3);
    expect(result.mission).toBeUndefined();
    expect(result.products[0]?.id).toBe("p1");
  });

  it("does not reuse a non-mission cache entry for a mission-enabled request", async () => {
    const searchProducts = vi.fn().mockResolvedValue({
      productIds: ["p1"],
      total: 1,
      projections: [{ id: "p1", name: "Sports" }],
    });
    const ct = createMockCommercetoolsClient({ searchProducts });
    const ai = createMockAi({
      decomposeShoppingMission: vi.fn().mockResolvedValue(twoIntents),
    });
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    await orchestrator.searchByText({ query: "racket and balls" });
    const missionResult = await orchestrator.searchByText({
      query: "racket and balls",
      enableMissions: true,
    });

    expect(ai.interpretTextQuery).toHaveBeenCalledTimes(2);
    expect(ai.decomposeShoppingMission).toHaveBeenCalledOnce();
    expect(missionResult.mission?.intents).toHaveLength(2);
  });
});

describe("createSearchOrchestrator.searchByVoice missions", () => {
  it("decomposes a spoken compound query into intent groups", async () => {
    const searchProducts = vi
      .fn()
      .mockResolvedValueOnce({
        productIds: ["p1"],
        total: 3,
        projections: [{ id: "p1", name: "Glass" }],
      })
      .mockResolvedValueOnce({
        productIds: ["p2"],
        total: 2,
        projections: [{ id: "p2", name: "Table" }],
      });
    const ct = createMockCommercetoolsClient({ searchProducts });
    const ai = createMockAi({
      interpretVoiceAudio: vi.fn().mockResolvedValue({
        transcript: "I am looking for some glasses and a coffee table",
        enhancedQuery: "glasses and coffee table",
        searchTerms: ["glasses", "coffee table"],
        interpretation: "glasses and coffee table",
        filters: {},
      }),
      decomposeShoppingMission: vi.fn().mockResolvedValue(twoIntents),
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, missions: { enabled: true, perIntentLimit: 4 } },
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByVoice(new Uint8Array([1, 2, 3]), "audio/webm", {
      enableTts: false,
    });

    expect(ai.interpretVoiceAudio).toHaveBeenCalledOnce();
    expect(ai.decomposeShoppingMission).toHaveBeenCalledWith(
      "glasses and coffee table",
      expect.anything(),
      expect.anything(),
    );
    expect(searchProducts).toHaveBeenCalledTimes(2);
    expect(result.mission?.intents).toHaveLength(2);
    expect(result.products.map((product) => product.id)).toEqual(["p1", "p2"]);
  });

  it("does not decompose when missions are off", async () => {
    const searchProducts = vi.fn().mockResolvedValue({
      productIds: ["p1"],
      total: 1,
      projections: [{ id: "p1", name: "Sports" }],
    });
    const ct = createMockCommercetoolsClient({ searchProducts });
    const ai = createMockAi({
      interpretVoiceAudio: vi.fn().mockResolvedValue({
        transcript: "glasses and a coffee table",
        enhancedQuery: "glasses and coffee table",
        searchTerms: ["glasses", "coffee table"],
        interpretation: "glasses and coffee table",
        filters: {},
      }),
    });
    const orchestrator = createSearchOrchestrator({
      config: baseConfig,
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByVoice(new Uint8Array([1]), "audio/webm", {
      enableTts: false,
    });

    expect(ai.decomposeShoppingMission).not.toHaveBeenCalled();
    expect(result.mission).toBeUndefined();
  });
});

describe("createSearchOrchestrator.searchByImage missions", () => {
  it("decomposes a vision interpretation into intent groups", async () => {
    const searchProducts = vi
      .fn()
      .mockResolvedValueOnce({
        productIds: ["p1"],
        total: 1,
        projections: [{ id: "p1", name: "Glass" }],
      })
      .mockResolvedValueOnce({
        productIds: ["p2"],
        total: 1,
        projections: [{ id: "p2", name: "Table" }],
      });
    const ct = createMockCommercetoolsClient({ searchProducts });
    const ai = createMockAi({
      interpretImageQuery: vi.fn().mockResolvedValue({
        searchTerms: ["glasses", "coffee table"],
        interpretation: "glasses and a coffee table",
        filters: {},
      }),
      decomposeShoppingMission: vi.fn().mockResolvedValue(twoIntents),
    });
    const orchestrator = createSearchOrchestrator({
      config: { ...baseConfig, missions: { enabled: true } },
      commercetoolsClient: ct,
      aiProvider: ai as never,
    });

    const result = await orchestrator.searchByImage(new Uint8Array([1, 2, 3]), "image/jpeg");

    expect(ai.interpretImageQuery).toHaveBeenCalledOnce();
    expect(ai.decomposeShoppingMission).toHaveBeenCalledWith(
      "glasses and a coffee table",
      expect.anything(),
      expect.anything(),
    );
    expect(result.mission?.intents).toHaveLength(2);
  });
});
