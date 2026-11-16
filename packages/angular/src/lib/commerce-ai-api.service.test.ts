import { provideZonelessChangeDetection, type Provider } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CommerceAIApiError, DEFAULT_COMMERCE_AI_SEARCH_MESSAGES } from "@commerce-ai-tool/core/client";
import { CommerceAiApiService } from "./commerce-ai-api.service";
import { COMMERCE_AI_FETCH } from "./commerce-ai-fetch.token";

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

function createService(providers: Provider[] = []): CommerceAiApiService {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), ...providers] });
  return TestBed.inject(CommerceAiApiService);
}

describe("CommerceAiApiService", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it("sends every request through the provided COMMERCE_AI_FETCH", async () => {
    const provided = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: [] }) });
    const globalFetch = vi.fn();
    vi.stubGlobal("fetch", globalFetch);

    const service = createService([{ provide: COMMERCE_AI_FETCH, useValue: provided }]);
    await service.suggest("/api/commerce-ai", "red");
    await service.search("/api/commerce-ai", "red").catch(() => undefined);

    expect(provided).toHaveBeenCalledWith(
      "/api/commerce-ai/search/suggestions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(provided.mock.calls.map(([url]) => url)).toEqual([
      "/api/commerce-ai/search/suggestions",
      "/api/commerce-ai/search",
    ]);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("falls back to the global fetch, resolved on each call", async () => {
    const service = createService();
    const late = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: ["x"] }) });
    vi.stubGlobal("fetch", late);

    await expect(service.suggest("/api/commerce-ai", "x")).resolves.toEqual({ suggestions: ["x"] });
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("posts suggestion requests to the suggestions endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: ["Red Shoes"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();
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

    const service = createService();
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

  it("sends facetSelections only when given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ products: [], meta: {} }) });
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();
    await service.search("/api/commerce-ai/", "shoes", { queryLocale: "en" }, undefined, {
      refineQuery: "red",
      facetSelections: { size: ["M"] },
    });
    await service.search("/api/commerce-ai", "shoes");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/commerce-ai/search");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      query: "shoes",
      refineQuery: "red",
      facetSelections: { size: ["M"] },
      queryLocale: "en",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ query: "shoes" });
  });

  it("passes the abort signal to every request and lets an abort through unchanged", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        throw new DOMException("aborted", "AbortError");
      }
      return { ok: true, json: async () => ({ products: [], meta: {} }), blob: async () => new Blob() };
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();
    const controller = new AbortController();

    await service.searchByImage("/api", new File(["x"], "a.png", { type: "image/png" }), {}, false, controller.signal);
    await service.searchByVoice("/api", new Blob(["a"]), {}, true, false, controller.signal);
    await service.synthesizeSpeech("/api", "hello", controller.signal);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.signal).toBe(controller.signal);
    }

    controller.abort();
    await expect(service.synthesizeSpeech("/api", "hello", controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("names the voice upload after the recorded container", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await createService().searchByVoice(
      "/api",
      new Blob(["a"], { type: "audio/mp4" }),
      {},
      false,
    );

    const form = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect((form.get("audio") as File).name).toBe("recording.m4a");
    expect(form.get("enableTts")).toBe("false");
  });

  it("rejects with a typed error for a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "Too many requests", code: "RATE_LIMITED" }),
      }),
    );

    const service = createService();
    await expect(service.search("/api", "shoes")).rejects.toBeInstanceOf(CommerceAIApiError);
    await expect(service.search("/api", "shoes")).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
    });
  });
});
