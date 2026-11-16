import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BadRequestResponseError,
  PaymentRequiredResponseError,
  RequestAbortedError,
  ServiceUnavailableResponseError,
  TooManyRequestsResponseError,
} from "@openrouter/sdk/models/errors";
import { AIOutputTruncatedError, AIRateLimitedError, AIUpstreamError } from "../errors.js";
import { DEFAULT_OPENROUTER_VISION_MODEL, MAX_TOKENS } from "../defaults.js";

const sdkSend = vi.fn();
const sdkOptions: unknown[] = [];

vi.mock("@openrouter/sdk", () => ({
  OpenRouter: class {
    chat = { send: sdkSend };
    constructor(options: unknown) {
      sdkOptions.push(options);
    }
  },
}));

const { OpenRouterProvider } = await import("./openrouter.js");

const locales = { queryLocale: "en", catalogLocale: "en" };
const queryJson = JSON.stringify({ searchTerms: ["shoes"], interpretation: "shoes" });
const voiceJson = JSON.stringify({
  transcript: "red shoes",
  enhancedQuery: "red shoes",
  searchTerms: ["red shoes"],
  interpretation: "red shoes",
});

function ok(content: string, finishReason: string | null = "stop") {
  return { model: "m", choices: [{ finishReason, message: { content } }] };
}

function httpMeta(status: number, body: string) {
  return {
    response: new Response(body, { status }),
    request: new Request("https://openrouter.ai/api/v1/chat/completions"),
    body,
  };
}

function jsonSchemaUnsupported() {
  const body = JSON.stringify({
    error: { code: 400, message: "response_format json_schema is not supported by this model" },
  });
  return new BadRequestResponseError(
    { error: { code: 400, message: "response_format json_schema is not supported by this model" } },
    httpMeta(400, body),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sdkSend.mockReset();
  sdkOptions.length = 0;
});

describe("OpenRouterProvider (SDK 1.x)", () => {
  it("sends maxCompletionTokens per task", async () => {
    const bySchema: Record<string, string> = {
      interpreted_search: queryJson,
      suggest_search_terms: JSON.stringify({ suggestions: ["shoes"] }),
      shopping_mission: JSON.stringify({ isMission: false, intents: [], interpretation: "x", confidence: 0.1 }),
      voice_audio_interpretation: voiceJson,
      voice_transcript_interpretation: voiceJson,
    };
    sdkSend.mockImplementation(
      async (request: { chatRequest: { responseFormat?: { jsonSchema?: { name: string } } } }) =>
        ok(bySchema[request.chatRequest.responseFormat?.jsonSchema?.name ?? ""] ?? "plain text"),
    );
    const provider = new OpenRouterProvider({ apiKey: "k" });

    await provider.interpretTextQuery("shoes", locales);
    await provider.interpretRefineQuery(
      "cheaper",
      { searchTerms: ["shoes"], filters: {}, attributeCatalog: [] },
      locales,
    );
    await provider.interpretImageQuery("abc", "image/png", locales);
    await provider.suggestSearchTerms("sho", locales);
    await provider.enhanceVoiceTranscript("red shoes", locales);
    await provider.summarizeVoiceResults(3, "Red shoe", locales);
    await provider.decomposeShoppingMission("party for 10", locales);
    await provider.interpretVoiceAudio(new Uint8Array([1, 2]), "audio/wav", locales);
    await provider.interpretVoiceTranscript("um red shoes", locales);

    const caps = sdkSend.mock.calls.map(
      ([request]) => (request as { chatRequest: { maxCompletionTokens?: number } }).chatRequest.maxCompletionTokens,
    );
    expect(caps).toEqual([
      MAX_TOKENS.interpret,
      MAX_TOKENS.refine,
      MAX_TOKENS.image,
      MAX_TOKENS.suggest,
      MAX_TOKENS.enhance,
      MAX_TOKENS.ttsSummary,
      MAX_TOKENS.mission,
      MAX_TOKENS.voiceAudio,
      MAX_TOKENS.voiceTranscript,
    ]);
    // Reasoning tokens count against these caps, so they leave room for low-effort reasoning.
    expect(MAX_TOKENS).toEqual({
      interpret: 2000,
      mission: 2000,
      suggest: 1000,
      refine: 2000,
      image: 2000,
      voiceAudio: 2000,
      voiceTranscript: 2000,
      enhance: 600,
      ttsSummary: 600,
    });
    for (const [request] of sdkSend.mock.calls) {
      const chatRequest = (request as { chatRequest: Record<string, unknown> }).chatRequest;
      expect(chatRequest).not.toHaveProperty("maxTokens");
      expect(chatRequest.reasoning).toEqual({ effort: "low" });
    }
  });

  it("interpretVoiceTranscript sends one json_schema call on the text model", async () => {
    sdkSend.mockResolvedValue(
      ok(JSON.stringify({ enhancedQuery: "red shoes", searchTerms: ["red shoes"], interpretation: "red shoes" })),
    );
    const provider = new OpenRouterProvider({ apiKey: "k", model: "text/model" });

    const result = await provider.interpretVoiceTranscript("um red shoes", locales, [
      { name: "color", label: "Color", kind: "enum" } as never,
    ]);

    expect(sdkSend).toHaveBeenCalledOnce();
    const { chatRequest } = sdkSend.mock.calls[0]![0] as {
      chatRequest: {
        model: string;
        messages: { role: string; content: string }[];
        responseFormat: { jsonSchema: { name: string } };
      };
    };
    expect(chatRequest.model).toBe("text/model");
    expect(chatRequest.responseFormat.jsonSchema.name).toBe("voice_transcript_interpretation");
    expect(chatRequest.messages[1]!.content).toContain("<transcript>");
    expect(chatRequest.messages[1]!.content).toContain("Filterable attribute catalog");
    expect(result).toEqual(expect.objectContaining({ enhancedQuery: "red shoes", searchTerms: ["red shoes"] }));
  });

  it("configures a bounded retry policy and request timeout on the client", () => {
    new OpenRouterProvider({ apiKey: "k" });

    expect(sdkOptions[0]).toMatchObject({
      apiKey: "k",
      timeoutMs: expect.any(Number) as number,
      retryConfig: {
        strategy: "backoff",
        retryConnectionErrors: true,
        backoff: { maxElapsedTime: expect.any(Number) as number },
      },
    });
    const { retryConfig } = sdkOptions[0] as {
      retryConfig: { backoff: { maxElapsedTime: number } };
    };
    // The retry budget must fit inside the default 15 s AI text step timeout.
    expect(retryConfig.backoff.maxElapsedTime).toBeLessThan(15_000);
  });

  it("passes the abort signal to the SDK", async () => {
    sdkSend.mockResolvedValue(ok(queryJson));
    const provider = new OpenRouterProvider({ apiKey: "k" });
    const controller = new AbortController();

    await provider.interpretTextQuery("shoes", locales, [], { signal: controller.signal });

    const [, requestOptions] = sdkSend.mock.calls[0] as [unknown, { signal?: AbortSignal; retryCodes?: string[] }];
    expect(requestOptions.signal).toBe(controller.signal);
    expect(requestOptions.retryCodes).toEqual(["429", "5XX"]);
  });

  it("rethrows the abort reason when the signal aborts the SDK call", async () => {
    const controller = new AbortController();
    const reason = new Error("client went away");
    sdkSend.mockImplementation(async () => {
      controller.abort(reason);
      throw new RequestAbortedError("Request aborted by client");
    });
    const provider = new OpenRouterProvider({ apiKey: "k" });

    await expect(
      provider.interpretTextQuery("shoes", locales, [], { signal: controller.signal }),
    ).rejects.toBe(reason);
  });

  it("throws AIOutputTruncatedError on finish_reason length", async () => {
    sdkSend.mockResolvedValue(ok('{"searchTerms":["sho', "length"));
    const provider = new OpenRouterProvider({ apiKey: "k" });
    const onMetrics = vi.fn();

    const error = await provider
      .interpretTextQuery("shoes", locales, [], { onMetrics })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AIOutputTruncatedError);
    expect((error as AIOutputTruncatedError).task).toBe("interpret");
    // The billed (truncated) call is still reported.
    expect(onMetrics).toHaveBeenCalledWith(expect.objectContaining({ finishReason: "length" }));
  });

  it("audio search goes through chat.send, no raw fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    sdkSend.mockResolvedValue(ok(voiceJson));
    const provider = new OpenRouterProvider({ apiKey: "k", voiceModel: "voice/model" });

    const result = await provider.interpretVoiceAudio(new Uint8Array([1, 2, 3]), "audio/wav", locales);

    expect(result.transcript).toBe("red shoes");
    expect(fetchSpy).not.toHaveBeenCalled();
    const [request] = sdkSend.mock.calls[0] as [
      { chatRequest: { model: string; messages: Array<{ content: unknown }>; responseFormat: { type: string } } },
    ];
    expect(request.chatRequest.model).toBe("voice/model");
    expect(request.chatRequest.responseFormat.type).toBe("json_schema");
    const userContent = request.chatRequest.messages[1]?.content as Array<Record<string, unknown>>;
    expect(userContent[1]).toEqual({
      type: "input_audio",
      inputAudio: { data: "AQID", format: "wav" },
    });
  });

  it("visionModel defaults to DEFAULT_OPENROUTER_VISION_MODEL, not the text model", async () => {
    sdkSend.mockResolvedValue(ok(queryJson));
    const provider = new OpenRouterProvider({ apiKey: "k", model: "text/model" });

    await provider.interpretImageQuery("abc", "image/png", locales);
    await provider.interpretTextQuery("shoes", locales);

    const models = sdkSend.mock.calls.map(
      ([request]) => (request as { chatRequest: { model: string } }).chatRequest.model,
    );
    expect(models).toEqual([DEFAULT_OPENROUTER_VISION_MODEL, "text/model"]);
  });

  it("an explicit visionModel wins over the default", async () => {
    sdkSend.mockResolvedValue(ok(queryJson));
    const provider = new OpenRouterProvider({ apiKey: "k", model: "text/model", visionModel: "vision/model" });

    await provider.interpretImageQuery("abc", "image/png", locales);

    expect(
      (sdkSend.mock.calls[0]![0] as { chatRequest: { model: string } }).chatRequest.model,
    ).toBe("vision/model");
  });

  it("json_schema fallback is attempted once per model", async () => {
    sdkSend
      .mockRejectedValueOnce(jsonSchemaUnsupported())
      .mockResolvedValue(ok(queryJson));
    const provider = new OpenRouterProvider({ apiKey: "k", model: "text/model" });

    await provider.interpretTextQuery("shoes", locales);
    await provider.interpretTextQuery("boots", locales);

    const formats = sdkSend.mock.calls.map(
      ([request]) => (request as { chatRequest: { responseFormat: { type: string } } }).chatRequest.responseFormat.type,
    );
    expect(formats).toEqual(["json_schema", "json_object", "json_object"]);
  });

  it("does not fall back for a 400 that only mentions json_schema", async () => {
    const body = JSON.stringify({ error: { code: 400, message: "json_schema: invalid schema at /properties" } });
    sdkSend.mockRejectedValueOnce(
      new BadRequestResponseError(
        { error: { code: 400, message: "json_schema: invalid schema at /properties" } },
        httpMeta(400, body),
      ),
    );
    const provider = new OpenRouterProvider({ apiKey: "k" });

    await expect(provider.interpretTextQuery("shoes", locales)).rejects.toBeInstanceOf(
      BadRequestResponseError,
    );
    expect(sdkSend).toHaveBeenCalledTimes(1);
  });

  it("classifies 429, 402 and 5xx without echoing the provider body", async () => {
    const provider = new OpenRouterProvider({ apiKey: "k" });
    const secretBody = JSON.stringify({ error: { code: 429, message: "upstream secret details" } });

    sdkSend.mockRejectedValueOnce(
      new TooManyRequestsResponseError(
        { error: { code: 429, message: "upstream secret details" } },
        httpMeta(429, secretBody),
      ),
    );
    const rateLimited = await provider.interpretTextQuery("a", locales).catch((e: unknown) => e);
    expect(rateLimited).toBeInstanceOf(AIRateLimitedError);
    expect((rateLimited as Error).message).not.toContain("secret");

    sdkSend.mockRejectedValueOnce(
      new PaymentRequiredResponseError(
        { error: { code: 402, message: "no credits" } },
        httpMeta(402, "{}"),
      ),
    );
    const credits = await provider.interpretTextQuery("a", locales).catch((e: unknown) => e);
    expect(credits).toBeInstanceOf(AIUpstreamError);
    expect((credits as AIUpstreamError).status).toBe(402);

    sdkSend.mockRejectedValueOnce(
      new ServiceUnavailableResponseError(
        { error: { code: 503, message: "down" } },
        httpMeta(503, "{}"),
      ),
    );
    const down = await provider.interpretTextQuery("a", locales).catch((e: unknown) => e);
    expect(down).toBeInstanceOf(AIUpstreamError);
    expect((down as AIUpstreamError).status).toBe(503);
  });
});
