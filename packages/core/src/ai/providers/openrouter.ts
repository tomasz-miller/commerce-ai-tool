import { OpenRouter } from "@openrouter/sdk";
import type { RetryConfig } from "@openrouter/sdk/lib/retries.js";
import type { ChatMessages, ChatRequest, ChatResult } from "@openrouter/sdk/models";
import {
  ConnectionError,
  OpenRouterError,
  RequestTimeoutError,
} from "@openrouter/sdk/models/errors";
import type { FacetAttributeDefinition, OpenRouterConfig, SearchLocaleContext } from "../../types/index.js";
import type { AICallMetrics, AICallOptions, AIProvider } from "../types.js";
import {
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_OPENROUTER_VISION_MODEL,
  DEFAULT_OPENROUTER_VOICE_MODEL,
  MAX_TOKENS,
  type AITask,
} from "../defaults.js";
import { AIOutputTruncatedError, AIRateLimitedError, AIUpstreamError } from "../errors.js";
import {
  buildRefineQueryUserMessage,
  buildSchemaAwareTextQueryUserMessage,
  buildImageQueryUserMessage,
  buildTextQueryUserMessage,
  buildVoiceAudioUserMessage,
  buildVoiceEnhanceUserMessage,
  buildVoiceTranscriptUserMessage,
  buildSuggestSearchTermsUserMessage,
  buildMissionQueryUserMessage,
  parseInterpretedQuery,
  parseVoiceAudioInterpretation,
  parseVoiceTranscriptInterpretation,
  parseSuggestSearchTerms,
  parseDecomposedMission,
  INTERPRETED_SEARCH_JSON_SCHEMA,
  MISSION_JSON_SCHEMA,
  SUGGEST_SEARCH_TERMS_JSON_SCHEMA,
  VOICE_AUDIO_JSON_SCHEMA,
  VOICE_TRANSCRIPT_JSON_SCHEMA,
  jsonSchemaResponseFormat,
  structuredOutputInstruction,
} from "../../prompts/index.js";
import { isJsonSchemaUnsupportedError } from "../json-schema-errors.js";
import { SYSTEM_PROMPT_NAMES } from "../../prompts/catalog.js";
import { resolveAndLinkSystemPrompt } from "../../prompts/resolve.js";
import { mimeTypeToAudioFormat, uint8ArrayToBase64 } from "../../utils/audio.js";
import { SearchTimeoutError } from "../../utils/with-timeout.js";
import { buildTtsSummaryUserMessage } from "../../search/voice-tts.js";

const STRUCTURED_TEMPERATURE = 0;

/**
 * Per-attempt HTTP timeout. The SDK applies it only when the call carries no AbortSignal; the
 * orchestrator always passes one, so there the step timeout (`config.timeouts`) bounds the call.
 * 20 s matches the largest default step timeout (`aiVoiceAudioMs`).
 */
export const OPENROUTER_REQUEST_TIMEOUT_MS = 20_000;

/**
 * Small backoff that fits inside the default 15 s AI text step: retries stop being scheduled once
 * 4 s have elapsed (an attempt in flight still runs until the step signal aborts it). Delays are
 * `250ms * attempt^2` plus up to 1 s of SDK jitter, capped at 2 s, and a provider `Retry-After`
 * is capped by the same 2 s. Connection resets are retried too.
 */
export const OPENROUTER_RETRY_CONFIG: RetryConfig = {
  strategy: "backoff",
  backoff: {
    initialInterval: 250,
    maxInterval: 2_000,
    exponent: 2,
    maxElapsedTime: 4_000,
  },
  retryConnectionErrors: true,
};

/** Status codes the SDK retries with the backoff above (its default is 5XX only). */
const RETRY_CODES = ["429", "5XX"];

/** Low reasoning effort on every call: these are short extraction tasks under a tight cap. */
const REASONING: ChatRequest["reasoning"] = { effort: "low" };

type JsonSchemaFormat = ReturnType<typeof jsonSchemaResponseFormat>;

export class OpenRouterProvider implements AIProvider {
  private readonly client: OpenRouter;
  private readonly model: string;
  private readonly visionModel: string;
  private readonly voiceModel: string;
  private readonly useJsonSchema: boolean;
  /** Models that rejected `json_schema` once: later calls go straight to `json_object`. */
  private readonly jsonSchemaUnsupportedModels = new Set<string>();

  constructor(config: OpenRouterConfig) {
    this.client = new OpenRouter({
      apiKey: config.apiKey,
      timeoutMs: OPENROUTER_REQUEST_TIMEOUT_MS,
      retryConfig: OPENROUTER_RETRY_CONFIG,
    });
    this.model = config.model ?? DEFAULT_OPENROUTER_MODEL;
    this.visionModel = config.visionModel ?? DEFAULT_OPENROUTER_VISION_MODEL;
    this.voiceModel = config.voiceModel ?? DEFAULT_OPENROUTER_VOICE_MODEL;
    this.useJsonSchema = config.jsonSchema !== false;
  }

  async interpretTextQuery(
    text: string,
    locales: SearchLocaleContext,
    attributeCatalog: FacetAttributeDefinition[] = [],
    options?: AICallOptions,
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
    const content = await this.sendStructured(
      "interpret",
      this.model,
      [
        { role: "system", content: system },
        {
          role: "user",
          content: attributeCatalog.length
            ? buildSchemaAwareTextQueryUserMessage(text, locales, attributeCatalog)
            : buildTextQueryUserMessage(text, locales),
        },
      ],
      jsonSchemaResponseFormat("interpreted_search", INTERPRETED_SEARCH_JSON_SCHEMA),
      options,
    );
    return parseInterpretedQuery(content);
  }

  async interpretRefineQuery(
    text: string,
    context: Parameters<AIProvider["interpretRefineQuery"]>[1],
    locales: SearchLocaleContext,
    options?: AICallOptions,
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.REFINE_QUERY);
    const content = await this.sendStructured(
      "refine",
      this.model,
      [
        { role: "system", content: system },
        { role: "user", content: buildRefineQueryUserMessage(text, locales, context) },
      ],
      jsonSchemaResponseFormat("interpreted_search", INTERPRETED_SEARCH_JSON_SCHEMA),
      options,
    );
    return parseInterpretedQuery(content);
  }

  async interpretImageQuery(
    imageBase64: string,
    mimeType: string,
    locales: SearchLocaleContext,
    attributeCatalog: FacetAttributeDefinition[] = [],
    options?: AICallOptions,
  ) {
    const dataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:${mimeType};base64,${imageBase64}`;

    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.IMAGE_QUERY);
    const content = await this.sendStructured(
      "image",
      this.visionModel,
      [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: buildImageQueryUserMessage(locales, attributeCatalog) },
            { type: "image_url", imageUrl: { url: dataUrl } },
          ],
        },
      ],
      jsonSchemaResponseFormat("interpreted_search", INTERPRETED_SEARCH_JSON_SCHEMA),
      options,
    );
    return parseInterpretedQuery(content);
  }

  async interpretVoiceAudio(
    audio: Uint8Array,
    mimeType: string,
    locales: SearchLocaleContext,
    attributeCatalog: FacetAttributeDefinition[] = [],
    options?: AICallOptions,
  ) {
    const format = mimeTypeToAudioFormat(mimeType);
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.VOICE_AUDIO_INTERPRET);
    const content = await this.sendStructured(
      "voiceAudio",
      this.voiceModel,
      [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: buildVoiceAudioUserMessage(locales, attributeCatalog) },
            { type: "input_audio", inputAudio: { data: uint8ArrayToBase64(audio), format } },
          ],
        },
      ],
      jsonSchemaResponseFormat("voice_audio_interpretation", VOICE_AUDIO_JSON_SCHEMA),
      options,
    );
    return parseVoiceAudioInterpretation(content);
  }

  async enhanceVoiceTranscript(
    transcript: string,
    locales: SearchLocaleContext,
    options?: AICallOptions,
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.VOICE_ENHANCE);
    const content = await this.send(
      "enhance",
      {
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: buildVoiceEnhanceUserMessage(transcript, locales) },
        ],
        temperature: STRUCTURED_TEMPERATURE,
      },
      options,
    );
    return content.trim();
  }

  async interpretVoiceTranscript(
    transcript: string,
    locales: SearchLocaleContext,
    attributeCatalog: FacetAttributeDefinition[] = [],
    options?: AICallOptions,
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.VOICE_TRANSCRIPT_INTERPRET);
    const content = await this.sendStructured(
      "voiceTranscript",
      this.model,
      [
        { role: "system", content: system },
        {
          role: "user",
          content: buildVoiceTranscriptUserMessage(transcript, locales, attributeCatalog),
        },
      ],
      jsonSchemaResponseFormat("voice_transcript_interpretation", VOICE_TRANSCRIPT_JSON_SCHEMA),
      options,
    );
    return parseVoiceTranscriptInterpretation(content);
  }

  async suggestSearchTerms(
    query: string,
    locales: SearchLocaleContext,
    limit = 8,
    options?: AICallOptions,
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.SUGGEST_SEARCH_TERMS);
    const content = await this.sendStructured(
      "suggest",
      this.model,
      [
        { role: "system", content: system },
        {
          role: "user",
          content: buildSuggestSearchTermsUserMessage(query, locales, limit),
        },
      ],
      jsonSchemaResponseFormat("suggest_search_terms", SUGGEST_SEARCH_TERMS_JSON_SCHEMA),
      options,
    );
    return parseSuggestSearchTerms(content, limit);
  }

  async summarizeVoiceResults(
    count: number,
    topProductName: string | undefined,
    locales: SearchLocaleContext,
    options?: AICallOptions,
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.TTS_SUMMARY);
    const content = await this.send(
      "ttsSummary",
      {
        model: this.model,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: buildTtsSummaryUserMessage(count, topProductName, locales),
          },
        ],
      },
      options,
    );
    return content.trim();
  }

  async decomposeShoppingMission(
    text: string,
    locales: SearchLocaleContext,
    attributeCatalog: FacetAttributeDefinition[] = [],
    options?: AICallOptions,
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.MISSION_QUERY);
    const content = await this.sendStructured(
      "mission",
      this.model,
      [
        { role: "system", content: system },
        {
          role: "user",
          content: buildMissionQueryUserMessage(text, locales, attributeCatalog),
        },
      ],
      jsonSchemaResponseFormat("shopping_mission", MISSION_JSON_SCHEMA),
      options,
    );
    return parseDecomposedMission(content);
  }

  /**
   * Sends `json_schema` structured output, or `json_object` plus a schema hint when json_schema
   * is disabled or the model rejected it before. A 400 that says json_schema is unsupported is
   * retried once as `json_object` and remembered for that model.
   */
  private async sendStructured(
    task: AITask,
    model: string,
    messages: ChatMessages[],
    schemaFormat: JsonSchemaFormat,
    options?: AICallOptions,
  ): Promise<string> {
    const jsonObjectRequest: Omit<ChatRequest, "maxCompletionTokens"> = {
      model,
      messages: appendStructuredOutputHint(messages, schemaFormat.jsonSchema.schema),
      responseFormat: { type: "json_object" },
      temperature: STRUCTURED_TEMPERATURE,
    };
    if (!this.useJsonSchema || this.jsonSchemaUnsupportedModels.has(model)) {
      return this.send(task, jsonObjectRequest, options);
    }

    try {
      return await this.send(
        task,
        { model, messages, responseFormat: schemaFormat, temperature: STRUCTURED_TEMPERATURE },
        options,
      );
    } catch (error) {
      if (!isJsonSchemaUnsupportedError(error)) {
        throw error;
      }
      this.jsonSchemaUnsupportedModels.add(model);
      return this.send(task, jsonObjectRequest, options);
    }
  }

  /**
   * One `chat.send` call with the task's token cap, low reasoning effort, the caller's signal and
   * the retry codes. Reports metrics for every completed response (truncated ones included),
   * then rejects truncated output. Provider errors are classified here; only the json_schema 400
   * passes through raw so `sendStructured` can fall back.
   */
  private async send(
    task: AITask,
    request: Omit<ChatRequest, "maxCompletionTokens">,
    options?: AICallOptions,
  ): Promise<string> {
    const model = request.model ?? this.model;
    let response: ChatResult;
    try {
      response = await this.client.chat.send(
        {
          chatRequest: {
            ...request,
            maxCompletionTokens: MAX_TOKENS[task],
            reasoning: REASONING,
            stream: false,
          },
        },
        {
          ...(options?.signal ? { signal: options.signal } : {}),
          retryCodes: RETRY_CODES,
        },
      );
    } catch (error) {
      if (options?.signal?.aborted) {
        throw abortReason(options.signal);
      }
      if (isJsonSchemaUnsupportedError(error)) {
        throw error;
      }
      throw classifyProviderError(error, task);
    }

    reportMetrics(options, response, model);
    if (response.choices[0]?.finishReason === "length") {
      throw new AIOutputTruncatedError(task, response.model || model);
    }
    return extractContent(response);
  }
}

/**
 * Maps SDK errors to typed core errors with fixed messages. Errors that are not provider
 * availability problems (400/401/403/422, parse errors) pass through for the host's generic 500.
 */
function classifyProviderError(error: unknown, task: AITask): unknown {
  if (
    error instanceof AIRateLimitedError ||
    error instanceof AIUpstreamError ||
    error instanceof SearchTimeoutError
  ) {
    return error;
  }
  if (error instanceof OpenRouterError) {
    if (error.statusCode === 429) {
      return new AIRateLimitedError({ cause: error });
    }
    if (error.statusCode === 402 || error.statusCode >= 500) {
      return new AIUpstreamError(error.statusCode, { cause: error });
    }
    return error;
  }
  if (error instanceof RequestTimeoutError) {
    return new SearchTimeoutError(`openrouter_${task}`, OPENROUTER_REQUEST_TIMEOUT_MS);
  }
  if (error instanceof ConnectionError) {
    return new AIUpstreamError(undefined, { cause: error });
  }
  return error;
}

function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new DOMException("The operation was aborted", "AbortError");
}

function extractContent(response: ChatResult): string {
  const content = response.choices[0]?.message.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
      .join("");
  }

  throw new Error("Empty response from OpenRouter");
}

/**
 * Maps an SDK chat result to per-call metrics. `fallbackModel` is the model that was requested;
 * the response's own `model` wins because it reflects provider-side fallbacks.
 */
function extractCallMetrics(response: ChatResult, fallbackModel: string): AICallMetrics {
  const model =
    typeof response.model === "string" && response.model.length > 0 ? response.model : fallbackModel;
  const metrics: AICallMetrics = { model };

  const usage = response.usage;
  if (usage) {
    const input = asFiniteNumber(usage.promptTokens);
    const output = asFiniteNumber(usage.completionTokens);
    const reportedTotal = asFiniteNumber(usage.totalTokens);
    if (input !== undefined || output !== undefined || reportedTotal !== undefined) {
      const inputTokens = input ?? 0;
      const outputTokens = output ?? 0;
      const cacheRead = asFiniteNumber(usage.promptTokensDetails?.cachedTokens);
      metrics.usage = {
        input: inputTokens,
        output: outputTokens,
        total: reportedTotal ?? inputTokens + outputTokens,
        ...(cacheRead ? { cacheRead } : {}),
      };
    }
    const cost = asFiniteNumber(usage.cost);
    if (cost !== undefined) {
      metrics.costUsd = cost;
    }
  }

  const finishReason = response.choices[0]?.finishReason;
  if (typeof finishReason === "string") {
    metrics.finishReason = finishReason;
  }

  return metrics;
}

function reportMetrics(
  options: AICallOptions | undefined,
  response: ChatResult,
  fallbackModel: string,
): void {
  if (!options?.onMetrics) {
    return;
  }
  try {
    options.onMetrics(extractCallMetrics(response, fallbackModel));
  } catch {
    // A failing metrics callback must never fail the AI call itself.
  }
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function appendStructuredOutputHint(
  messages: ChatMessages[],
  schema: Record<string, unknown> | undefined,
): ChatMessages[] {
  return [...messages, { role: "user", content: structuredOutputInstruction(schema ?? {}) }];
}
