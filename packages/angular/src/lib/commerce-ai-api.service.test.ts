import { describe, expect, it, vi } from "vitest";
import { DEFAULT_COMMERCE_AI_SEARCH_MESSAGES } from "@commerce-ai-tool/core";
import { CommerceAiApiService } from "./commerce-ai-api.service.js";

describe("CommerceAiApiService", () => {
  it("posts suggestion requests to the suggestions endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: ["Red Shoes"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new CommerceAiApiService();
    const result = await service.suggest("/api/commerce-ai", "red", {
      catalogLocale: "en",
    });

    expect(result).toEqual({ suggestions: ["Red Shoes"] });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/commerce-ai/search/suggestions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ query: "red", catalogLocale: "en" }),
      }),
    );
  });

  it("uses custom messages placeholder through component defaults", () => {
    expect(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.placeholder).toBe("What are you looking for?");
  });
});
