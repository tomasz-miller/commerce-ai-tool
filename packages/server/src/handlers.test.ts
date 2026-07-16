import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { SearchTimeoutError } from "@commerce-ai-tool/core";
import type { SearchOrchestrator } from "@commerce-ai-tool/core";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHandlers } from "./handlers.js";
import type { CommerceAIServer } from "./server.js";
import {
  executeSearch,
  executeSearchSuggestions,
  executeSearchVoice,
  executeTts,
  mapRouteError,
  ValidationError,
} from "./route-actions.js";

function createMockServer(overrides: Partial<CommerceAIServer> = {}): CommerceAIServer {
  const orchestrator = {
    searchByText: vi.fn().mockResolvedValue({
      products: [{ id: "p1", name: "Shoe" }],
      meta: { total: 1 },
    }),
    searchByVoice: vi.fn().mockResolvedValue({
      transcript: "red shoes",
      enhancedQuery: "red running shoes",
      products: [],
      meta: { total: 0 },
      ttsText: "Found shoes",
    }),
    searchByImage: vi.fn().mockResolvedValue({
      interpretation: "sneakers",
      products: [],
      meta: { total: 0 },
    }),
    suggestByText: vi.fn().mockResolvedValue({
      suggestions: ["Red Shoes", "Running Shoes"],
    }),
  } satisfies Partial<SearchOrchestrator>;

  return {
    orchestrator: orchestrator as SearchOrchestrator,
    transcribeAudio: vi.fn(),
    synthesizeSpeech: vi.fn().mockResolvedValue(Buffer.from("mp3-bytes")),
    ...overrides,
  };
}

function jsonRequest(body: unknown): IncomingMessage {
  return Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
}

function createTestApp(handlers: ReturnType<typeof createHandlers>) {
  const app = express();

  app.get("/health", async (_req, res) => {
    const response = await handlers.health();
    res.status(response.status);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }
    res.send(response.body);
  });

  app.post("/search", async (req, res) => {
    const response = await handlers.search(req);
    res.status(response.status);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }
    res.send(response.body);
  });

  app.post("/search/suggestions", async (req, res) => {
    const response = await handlers.searchSuggestions(req);
    res.status(response.status);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }
    res.send(response.body);
  });

  app.post("/search/voice", async (req, res) => {
    const response = await handlers.searchVoice(req);
    res.status(response.status);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }
    res.send(response.body);
  });

  app.post("/search/image", async (req, res) => {
    const response = await handlers.searchImage(req);
    res.status(response.status);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }
    res.send(response.body);
  });

  app.post("/tts", async (req, res) => {
    const response = await handlers.tts(req);
    res.status(response.status);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }
    res.send(response.body);
  });

  return app;
}

describe("route-actions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executeSearch rejects empty query", async () => {
    const server = createMockServer();

    await expect(executeSearch(server, { query: "  " })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("executeSearch delegates to orchestrator", async () => {
    const server = createMockServer();

    const result = await executeSearch(server, {
      query: "red shoes",
      queryLocale: "en",
      catalogLocale: "no",
      limit: 5,
    });

    expect(server.orchestrator.searchByText).toHaveBeenCalledWith({
      query: "red shoes",
      queryLocale: "en",
      catalogLocale: "no",
      locale: undefined,
      limit: 5,
    });
    expect(result).toEqual({
      products: [{ id: "p1", name: "Shoe" }],
      meta: { total: 1 },
    });
  });

  it("executeSearchSuggestions rejects short query", async () => {
    const server = createMockServer();

    await expect(executeSearchSuggestions(server, { query: "  " })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(executeSearchSuggestions(server, { query: "a" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("executeSearchSuggestions delegates to orchestrator", async () => {
    const server = createMockServer();

    const result = await executeSearchSuggestions(server, {
      query: "red",
      catalogLocale: "en",
      limit: 5,
    });

    expect(server.orchestrator.suggestByText).toHaveBeenCalledWith({
      query: "red",
      catalogLocale: "en",
      queryLocale: undefined,
      locale: undefined,
      limit: 5,
    });
    expect(result).toEqual({ suggestions: ["Red Shoes", "Running Shoes"] });
  });

  it("executeTts rejects empty text", async () => {
    const server = createMockServer();

    await expect(executeTts(server, "   ")).rejects.toBeInstanceOf(ValidationError);
  });

  it("executeSearchVoice includes blocking TTS audio summary", async () => {
    const server = createMockServer();

    const result = await executeSearchVoice(server, { blockingTts: "true" }, {
      buffer: Buffer.from("audio"),
      mimeType: "audio/webm",
      filename: "voice.webm",
    });

    expect(server.synthesizeSpeech).toHaveBeenCalledWith("Found shoes");
    expect(result.audioSummary).toBe(Buffer.from("mp3-bytes").toString("base64"));
    expect(result.ttsPending).toBe(false);
  });

  it("mapRouteError maps timeout and validation errors", () => {
    expect(mapRouteError(new SearchTimeoutError("voice", 20_000), "searchVoice", "fail")).toEqual({
      message: "Search timed out after 20000ms at step: voice",
      status: 504,
    });

    expect(mapRouteError(new ValidationError("bad input"), "search", "fail")).toEqual({
      message: "bad input",
      status: 400,
    });
  });
});

describe("createHandlers HTTP", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("health returns ok", async () => {
    const handlers = createHandlers(createMockServer());
    const response = await handlers.health();

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({ status: "ok" });
  });

  it("search validates query via IncomingMessage", async () => {
    const handlers = createHandlers(createMockServer());
    const response = await handlers.search(jsonRequest({ query: "" }));

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toEqual({ error: "query is required" });
  });

  it("search returns orchestrator result", async () => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    const response = await handlers.search(jsonRequest({ query: "boots" }));

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({
      products: [{ id: "p1", name: "Shoe" }],
      meta: { total: 1 },
    });
  });

  it("searchSuggestions validates query via IncomingMessage", async () => {
    const handlers = createHandlers(createMockServer());
    const response = await handlers.searchSuggestions(jsonRequest({ query: "" }));

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "query must be at least 2 characters",
    });
  });

  it("searchSuggestions returns orchestrator result", async () => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    const response = await handlers.searchSuggestions(jsonRequest({ query: "red" }));

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({
      suggestions: ["Red Shoes", "Running Shoes"],
    });
  });

  it("tts returns audio buffer", async () => {
    const handlers = createHandlers(createMockServer());
    const response = await handlers.tts(jsonRequest({ text: "hello" }));

    expect(response.status).toBe(200);
    expect(response.headers?.["Content-Type"]).toBe("audio/mpeg");
    expect(response.body).toEqual(Buffer.from("mp3-bytes"));
  });

  it("express routes handle search and multipart voice", async () => {
    const server = createMockServer();
    const app = createTestApp(createHandlers(server));

    const searchResponse = await request(app)
      .post("/search")
      .send({ query: "jacket", limit: 3 })
      .expect(200);

    expect(searchResponse.body).toEqual({
      products: [{ id: "p1", name: "Shoe" }],
      meta: { total: 1 },
    });
    expect(server.orchestrator.searchByText).toHaveBeenCalledWith(
      expect.objectContaining({ query: "jacket", limit: 3 }),
    );

    const suggestionsResponse = await request(app)
      .post("/search/suggestions")
      .send({ query: "red" })
      .expect(200);

    expect(suggestionsResponse.body).toEqual({
      suggestions: ["Red Shoes", "Running Shoes"],
    });
    expect(server.orchestrator.suggestByText).toHaveBeenCalled();

    const voiceResponse = await request(app)
      .post("/search/voice")
      .field("enableTts", "false")
      .attach("audio", Buffer.from("voice-data"), {
        filename: "clip.webm",
        contentType: "audio/webm",
      })
      .expect(200);

    expect(voiceResponse.body.transcript).toBe("red shoes");
    expect(server.orchestrator.searchByVoice).toHaveBeenCalled();
  });

  it("express routes reject voice search without audio", async () => {
    const app = createTestApp(createHandlers(createMockServer()));

    const response = await request(app)
      .post("/search/voice")
      .field("limit", "5")
      .expect(400);

    expect(response.body).toEqual({ error: "audio file is required" });
  });

  it("express routes handle image upload", async () => {
    const server = createMockServer();
    const app = createTestApp(createHandlers(server));

    const response = await request(app)
      .post("/search/image")
      .field("catalogLocale", "no")
      .attach("image", Buffer.from("image-bytes"), {
        filename: "photo.jpg",
        contentType: "image/jpeg",
      })
      .expect(200);

    expect(response.body.interpretation).toBe("sneakers");
    expect(server.orchestrator.searchByImage).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "image/jpeg",
      expect.objectContaining({ catalogLocale: "no" }),
    );
  });
});
