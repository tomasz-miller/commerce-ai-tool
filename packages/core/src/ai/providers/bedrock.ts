import {
  BedrockRuntimeClient,
  ConverseCommand,
  ValidationException,
  type ContentBlock,
  type ConverseCommandInput,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import type {
  BedrockConfig,
  FacetAttributeDefinition,
  SearchLocaleContext,
  VoiceAudioInterpretation,
} from "../../types/index.js";
import type { AICallMetrics, AICallOptions, AIProvider } from "../types.js";
import { DEFAULT_BEDROCK_MODEL, MAX_TOKENS, type AITask } from "../defaults.js";
import { AIOutputTruncatedError, AIRateLimitedError, AIUpstreamError } from "../errors.js";
import { extractJsonObjectLiteral } from "../../utils/model-json.js";
import {
  buildRefineQueryUserMessage,
  buildSchemaAwareTextQueryUserMessage,
  buildImageQueryUserMessage,
  buildTextQueryUserMessage,
  buildVoiceEnhanceUserMessage,
  buildVoiceTranscriptUserMessage,
  buildSuggestSearchTermsUserMessage,
  buildMissionQueryUserMessage,
  parseInterpretedQuery,
  parseVoiceTranscriptInterpretation,
  parseSuggestSearchTerms,
  parseDecomposedMission,
  INTERPRETED_SEARCH_JSON_SCHEMA,
  MISSION_JSON_SCHEMA,
  SUGGEST_SEARCH_TERMS_JSON_SCHEMA,
  VOICE_TRANSCRIPT_JSON_SCHEMA,
  withStructuredOutputInstruction,
} from "../../prompts/index.js";
import { SYSTEM_PROMPT_NAMES } from "../../prompts/catalog.js";
import { resolveAndLinkSystemPrompt } from "../../prompts/resolve.js";
import { buildTtsSummaryUserMessage } from "../../search/voice-tts.js";

/**
 * Attempts per Converse call (first try plus retries). This is the SDK default, set explicitly so
 * the retry budget is visible here. The SDK backs off for well under a second between attempts
 * and the step timeout aborts a call in flight, so three attempts stay inside the 15 s AI step.
 */
const MAX_ATTEMPTS = 3;

/** Models that rejected `outputConfig.textFormat`; later calls skip it and rely on the prompt. */
const modelsWithoutStructuredOutput = new Set<string>();

type ContentBlocks = ContentBlock[];

interface StructuredFormat {
  name: string;
  schema: object;
}

interface ConverseCall {
  task: AITask;
  modelId: string;
  system: string;
  content: ContentBlocks;
  /** Set for the JSON methods only. Plain-text methods leave it out and get raw text back. */
  structured?: StructuredFormat;
  options?: AICallOptions;
}

export class BedrockProvider implements AIProvider {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;
  private readonly visionModelId: string;

  constructor(config: BedrockConfig) {
    this.client = new BedrockRuntimeClient({ region: config.region, maxAttempts: MAX_ATTEMPTS });
    this.modelId = config.modelId ?? DEFAULT_BEDROCK_MODEL;
    this.visionModelId = config.visionModelId ?? config.modelId ?? DEFAULT_BEDROCK_MODEL;
  }

  async interpretTextQuery(
    text: string,
    locales: SearchLocaleContext,
    attributeCatalog: FacetAttributeDefinition[] = [],
    options?: AICallOptions,
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
    const raw = await this.converse({
      task: "interpret",
      modelId: this.modelId,
      system,
      content: [
        {
          text: withStructuredOutputInstruction(
            attributeCatalog.length
              ? buildSchemaAwareTextQueryUserMessage(text, locales, attributeCatalog)
              : buildTextQueryUserMessage(text, locales),
            INTERPRETED_SEARCH_JSON_SCHEMA,
          ),
        },
      ],
      structured: { name: "interpreted_search", schema: INTERPRETED_SEARCH_JSON_SCHEMA },
      options,
    });

    return parseInterpretedQuery(raw);
  }

  async interpretRefineQuery(
    text: string,
    context: Parameters<AIProvider["interpretRefineQuery"]>[1],
    locales: SearchLocaleContext,
    options?: AICallOptions,
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.REFINE_QUERY);
    const raw = await this.converse({
      task: "refine",
      modelId: this.modelId,
      system,
      content: [
        {
          text: withStructuredOutputInstruction(
            buildRefineQueryUserMessage(text, locales, context),
            INTERPRETED_SEARCH_JSON_SCHEMA,
          ),
        },
      ],
      structured: { name: "interpreted_search", schema: INTERPRETED_SEARCH_JSON_SCHEMA },
      options,
    });

    return parseInterpretedQuery(raw);
  }

  async interpretImageQuery(
    imageBase64: string,
    mimeType: string,
    locales: SearchLocaleContext,
    attributeCatalog: FacetAttributeDefinition[] = [],
    options?: AICallOptions,
  ) {
    const rawBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");
    const format = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpeg";

    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.IMAGE_QUERY);
    const raw = await this.converse({
      task: "image",
      modelId: this.visionModelId,
      system,
      content: [
        {
          text: withStructuredOutputInstruction(
            buildImageQueryUserMessage(locales, attributeCatalog),
            INTERPRETED_SEARCH_JSON_SCHEMA,
          ),
        },
        {
          image: {
            format,
            source: { bytes: Buffer.from(rawBase64, "base64") },
          },
        },
      ],
      structured: { name: "interpreted_search", schema: INTERPRETED_SEARCH_JSON_SCHEMA },
      options,
    });

    return parseInterpretedQuery(raw);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- keeps the AIProvider contract; Bedrock has no audio interpretation
  async interpretVoiceAudio(
    _audio: Uint8Array,
    _mimeType: string,
    _locales: SearchLocaleContext,
    _attributeCatalog?: FacetAttributeDefinition[],
    _options?: AICallOptions,
  ): Promise<VoiceAudioInterpretation> {
    throw new Error(
      "Direct voice audio interpretation requires OpenRouter with an audio-capable model (e.g. google/gemini-3.7-flash)",
    );
  }

  async enhanceVoiceTranscript(
    transcript: string,
    locales: SearchLocaleContext,
    options?: AICallOptions,
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.VOICE_ENHANCE);
    const text = await this.converse({
      task: "enhance",
      modelId: this.modelId,
      system,
      content: [{ text: buildVoiceEnhanceUserMessage(transcript, locales) }],
      options,
    });

    return text.trim();
  }

  async interpretVoiceTranscript(
    transcript: string,
    locales: SearchLocaleContext,
    attributeCatalog: FacetAttributeDefinition[] = [],
    options?: AICallOptions,
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.VOICE_TRANSCRIPT_INTERPRET);
    const raw = await this.converse({
      task: "voiceTranscript",
      modelId: this.modelId,
      system,
      content: [
        {
          text: withStructuredOutputInstruction(
            buildVoiceTranscriptUserMessage(transcript, locales, attributeCatalog),
            VOICE_TRANSCRIPT_JSON_SCHEMA,
          ),
        },
      ],
      structured: { name: "voice_transcript_interpretation", schema: VOICE_TRANSCRIPT_JSON_SCHEMA },
      options,
    });

    return parseVoiceTranscriptInterpretation(raw);
  }

  async suggestSearchTerms(
    query: string,
    locales: SearchLocaleContext,
    limit = 8,
    options?: AICallOptions,
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.SUGGEST_SEARCH_TERMS);
    const raw = await this.converse({
      task: "suggest",
      modelId: this.modelId,
      system,
      content: [
        {
          text: withStructuredOutputInstruction(
            buildSuggestSearchTermsUserMessage(query, locales, limit),
            SUGGEST_SEARCH_TERMS_JSON_SCHEMA,
          ),
        },
      ],
      structured: { name: "suggest_search_terms", schema: SUGGEST_SEARCH_TERMS_JSON_SCHEMA },
      options,
    });

    return parseSuggestSearchTerms(raw, limit);
  }

  async summarizeVoiceResults(
    count: number,
    topProductName: string | undefined,
    locales: SearchLocaleContext,
    options?: AICallOptions,
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.TTS_SUMMARY);
    const text = await this.converse({
      task: "ttsSummary",
      modelId: this.modelId,
      system,
      content: [{ text: buildTtsSummaryUserMessage(count, topProductName, locales) }],
      options,
    });

    return text.trim();
  }

  async decomposeShoppingMission(
    text: string,
    locales: SearchLocaleContext,
    attributeCatalog: FacetAttributeDefinition[] = [],
    options?: AICallOptions,
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.MISSION_QUERY);
    const raw = await this.converse({
      task: "mission",
      modelId: this.modelId,
      system,
      content: [
        {
          text: withStructuredOutputInstruction(
            buildMissionQueryUserMessage(text, locales, attributeCatalog),
            MISSION_JSON_SCHEMA,
          ),
        },
      ],
      structured: { name: "shopping_mission", schema: MISSION_JSON_SCHEMA },
      options,
    });

    return parseDecomposedMission(raw);
  }

  /**
   * One Converse call. The resolved prompt goes in `system`, the shopper's text and image stay in
   * the user turn. Metrics are reported for every completed response (truncated ones included),
   * then output cut by the token cap is rejected. Returns the model text: the JSON object literal
   * for structured calls, the raw text otherwise.
   */
  private async converse(call: ConverseCall): Promise<string> {
    const { task, modelId, system, content, structured, options } = call;
    const input: ConverseCommandInput = {
      modelId,
      system: [{ text: system }],
      messages: [{ role: "user", content }],
      inferenceConfig: { maxTokens: MAX_TOKENS[task], temperature: 0 },
    };

    const useSchema = structured !== undefined && !modelsWithoutStructuredOutput.has(modelId);
    let response: ConverseCommandOutput;
    try {
      response = await this.send(useSchema ? withOutputFormat(input, structured) : input, options);
    } catch (error) {
      if (!useSchema || !(error instanceof ValidationException) || options?.signal?.aborted) {
        throw error;
      }
      // The model may not support outputConfig.textFormat. Retry once on the prompt instruction
      // alone and only remember the model as unsupported when that retry succeeds, so a request
      // that is invalid for another reason does not switch the schema off.
      response = await this.send(input, options);
      modelsWithoutStructuredOutput.add(modelId);
    }

    reportConverseMetrics(options, response, modelId);
    if (response.stopReason === "max_tokens") {
      throw new AIOutputTruncatedError(task, modelId);
    }

    const text = extractText(response);
    return structured ? extractJsonObjectLiteral(text) : text;
  }

  private async send(input: ConverseCommandInput, options?: AICallOptions): Promise<ConverseCommandOutput> {
    const signal = options?.signal;
    try {
      return await this.client.send(
        new ConverseCommand(input),
        ...(signal ? [{ abortSignal: signal }] : []),
      );
    } catch (error) {
      if (signal?.aborted) {
        throw abortReason(signal);
      }
      throw classifyProviderError(error);
    }
  }
}

/**
 * Maps Bedrock availability errors to typed core errors with fixed messages (the AWS message is
 * kept only as `cause`). Validation, access-denied and other errors pass through unchanged: they
 * are host misconfiguration and surface as the host's generic 500. Matched by exception name, as
 * the SDK sets `name` to the class name on every modelled exception.
 */
function classifyProviderError(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error;
  }
  switch (error.name) {
    case "ThrottlingException":
    case "ServiceQuotaExceededException":
      return new AIRateLimitedError({ cause: error });
    case "ServiceUnavailableException":
    case "InternalServerException":
    case "ModelNotReadyException":
    case "ModelTimeoutException": {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      return new AIUpstreamError(status, { cause: error });
    }
    default:
      return error;
  }
}

function withOutputFormat(input: ConverseCommandInput, format: StructuredFormat): ConverseCommandInput {
  return {
    ...input,
    outputConfig: {
      textFormat: {
        type: "json_schema",
        structure: {
          jsonSchema: { name: format.name, schema: JSON.stringify(format.schema) },
        },
      },
    },
  };
}

function extractText(response: ConverseCommandOutput): string {
  const blocks = response.output?.message?.content ?? [];
  const text = blocks.map((block) => block.text ?? "").join("");

  if (!text) {
    throw new Error("Empty response from Bedrock");
  }

  return text;
}

function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new DOMException("The operation was aborted", "AbortError");
}

/**
 * The Converse response carries no model echo, so the model id sent in the request is reported.
 * Usage comes from `response.usage` (inputTokens, outputTokens, totalTokens, cacheReadInputTokens).
 */
function reportConverseMetrics(
  options: AICallOptions | undefined,
  response: ConverseCommandOutput,
  modelId: string,
): void {
  if (!options?.onMetrics) {
    return;
  }

  const metrics: AICallMetrics = { model: modelId };
  const usage = response.usage;
  if (usage) {
    const input = usage.inputTokens ?? 0;
    const output = usage.outputTokens ?? 0;
    const cacheRead = usage.cacheReadInputTokens;
    metrics.usage = {
      input,
      output,
      total: usage.totalTokens ?? input + output,
      ...(cacheRead ? { cacheRead } : {}),
    };
  }
  if (response.stopReason) {
    metrics.finishReason = response.stopReason;
  }

  try {
    options.onMetrics(metrics);
  } catch {
    // A failing metrics callback must never fail the AI call itself.
  }
}
