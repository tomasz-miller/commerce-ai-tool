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
