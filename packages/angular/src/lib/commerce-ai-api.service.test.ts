import { describe, expect, it, vi } from "vitest";
import { DEFAULT_COMMERCE_AI_SEARCH_MESSAGES } from "@commerce-ai-tool/core/client";
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

  it("sends enableMissions on text, image, and voice search", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ products: [], meta: {} }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new CommerceAiApiService();
    await service.search("/api/commerce-ai", "racket and balls", {}, undefined, {
      enableMissions: true,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      query: "racket and balls",
      enableMissions: true,
    });

    const image = new File(["x"], "shoe.png", { type: "image/png" });
    await service.searchByImage("/api/commerce-ai", image, { catalogLocale: "en" }, true);
    const imageBody = fetchMock.mock.calls[1]?.[1]?.body as FormData;
    expect(imageBody.get("enableMissions")).toBe("true");

    await service.searchByVoice("/api/commerce-ai", new Blob(["audio"]), {}, true, true);
    const voiceBody = fetchMock.mock.calls[2]?.[1]?.body as FormData;
    expect(voiceBody.get("enableMissions")).toBe("true");
    expect(voiceBody.get("enableTts")).toBe("true");
  });
});
