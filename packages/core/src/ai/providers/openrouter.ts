import { OpenRouter } from "@openrouter/sdk";
import type { FacetAttributeDefinition, OpenRouterConfig, SearchLocaleContext } from "../../types/index.js";
import type { AIProvider, GenerationMetrics } from "../types.js";
import {
  buildRefineQueryUserMessage,
  buildSchemaAwareTextQueryUserMessage,
  buildImageQueryUserMessage,
  buildTextQueryUserMessage,
  buildVoiceAudioUserMessage,
  buildVoiceEnhanceUserMessage,
  buildSuggestSearchTermsUserMessage,
  buildMissionQueryUserMessage,
  parseInterpretedQuery,
  parseVoiceAudioInterpretation,
  parseSuggestSearchTerms,
  parseDecomposedMission,
  INTERPRETED_SEARCH_JSON_SCHEMA,
  MISSION_JSON_SCHEMA,
  SUGGEST_SEARCH_TERMS_JSON_SCHEMA,
  VOICE_AUDIO_JSON_SCHEMA,
  jsonSchemaResponseFormat,
  structuredOutputInstruction,
} from "../../prompts/index.js";
import { isJsonSchemaUnsupportedError, isJsonSchemaUnsupportedMessage } from "../json-schema-errors.js";
import { SYSTEM_PROMPT_NAMES } from "../../prompts/catalog.js";
import { resolveAndLinkSystemPrompt } from "../../prompts/resolve.js";
import { mimeTypeToAudioFormat, uint8ArrayToBase64 } from "../../utils/audio.js";
import { buildTtsSummaryUserMessage } from "../../search/voice-tts.js";

const DEFAULT_MODEL = "openai/gpt-5.6-luna";
const DEFAULT_VISION_MODEL = "google/gemini-3.7-flash";
const DEFAULT_VOICE_MODEL = "google/gemini-3.7-flash";
const STRUCTURED_TEMPERATURE = 0;

type JsonResponseFormat =
  | { type: "json_object" }
  | ReturnType<typeof jsonSchemaResponseFormat>;

export class OpenRouterProvider implements AIProvider {
  private readonly client: OpenRouter;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly visionModel: string;
  private readonly voiceModel: string;
  private readonly useJsonSchema: boolean;
  private lastMetrics: GenerationMetrics | undefined;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    this.client = new OpenRouter({ apiKey: config.apiKey });
    this.model = config.model ?? DEFAULT_MODEL;
    this.visionModel = config.visionModel ?? config.model ?? DEFAULT_VISION_MODEL;
    this.voiceModel = config.voiceModel ?? DEFAULT_VOICE_MODEL;
    this.useJsonSchema = config.jsonSchema !== false;
  }

  getLastGenerationMetrics(): GenerationMetrics | undefined {
    return this.lastMetrics;
  }

  async interpretTextQuery(
    text: string,
    locales: SearchLocaleContext,
    attributeCatalog: FacetAttributeDefinition[] = [],
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
    const content = await this.sendStructured(
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
    );
    return parseInterpretedQuery(content);
  }

  async interpretRefineQuery(
    text: string,
    context: Parameters<AIProvider["interpretRefineQuery"]>[1],
    locales: SearchLocaleContext,
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.REFINE_QUERY);
    const content = await this.sendStructured(
      this.model,
      [
        { role: "system", content: system },
        { role: "user", content: buildRefineQueryUserMessage(text, locales, context) },
      ],
      jsonSchemaResponseFormat("interpreted_search", INTERPRETED_SEARCH_JSON_SCHEMA),
    );
    return parseInterpretedQuery(content);
  }

  async interpretImageQuery(
    imageBase64: string,
    mimeType: string,
    locales: SearchLocaleContext,
    attributeCatalog: FacetAttributeDefinition[] = [],
  ) {
    const dataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:${mimeType};base64,${imageBase64}`;

    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.IMAGE_QUERY);
    const content = await this.sendStructured(
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
    );
    return parseInterpretedQuery(content);
  }

  async interpretVoiceAudio(
    audio: Uint8Array,
    mimeType: string,
    locales: SearchLocaleContext,
    attributeCatalog: FacetAttributeDefinition[] = [],
  ) {
    const format = mimeTypeToAudioFormat(mimeType);
    const base64Audio = uint8ArrayToBase64(audio);

    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.VOICE_AUDIO_INTERPRET);
    const messages = [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: buildVoiceAudioUserMessage(locales, attributeCatalog) },
          {
            type: "input_audio",
            input_audio: {
              data: base64Audio,
              format,
            },
          },
        ],
      },
    ];
    const response = await this.sendChatCompletion({
      model: this.voiceModel,
      messages: this.useJsonSchema
        ? messages
        : appendStructuredOutputHint(messages, VOICE_AUDIO_JSON_SCHEMA),
      response_format: this.toApiResponseFormat(
        jsonSchemaResponseFormat("voice_audio_interpretation", VOICE_AUDIO_JSON_SCHEMA),
      ),
      max_tokens: 4096,
      reasoning: { effort: "low" },
      temperature: STRUCTURED_TEMPERATURE,
    });

    const content = this.extractContent(response);
    this.captureUsage(response);
    return parseVoiceAudioInterpretation(content);
  }

  async enhanceVoiceTranscript(transcript: string, locales: SearchLocaleContext) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.VOICE_ENHANCE);
    const response = await this.client.chat.send({
      model: this.model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: buildVoiceEnhanceUserMessage(transcript, locales),
        },
      ],
    });

    this.captureUsage(response);
    return this.extractContent(response).trim();
  }

  async suggestSearchTerms(query: string, locales: SearchLocaleContext, limit = 8) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.SUGGEST_SEARCH_TERMS);
    const content = await this.sendStructured(
      this.model,
      [
        { role: "system", content: system },
        {
          role: "user",
          content: buildSuggestSearchTermsUserMessage(query, locales, limit),
        },
      ],
      jsonSchemaResponseFormat("suggest_search_terms", SUGGEST_SEARCH_TERMS_JSON_SCHEMA),
    );
    return parseSuggestSearchTerms(content, limit);
  }

  async summarizeVoiceResults(
    count: number,
    topProductName: string | undefined,
    locales: SearchLocaleContext,
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.TTS_SUMMARY);
    const response = await this.client.chat.send({
      model: this.model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: buildTtsSummaryUserMessage(count, topProductName, locales),
        },
      ],
    });

    this.captureUsage(response);
    return this.extractContent(response).trim();
  }

  async decomposeShoppingMission(
    text: string,
    locales: SearchLocaleContext,
    attributeCatalog: FacetAttributeDefinition[] = [],
  ) {
    const system = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.MISSION_QUERY);
    const content = await this.sendStructured(
      this.model,
      [
        { role: "system", content: system },
        {
          role: "user",
          content: buildMissionQueryUserMessage(text, locales, attributeCatalog),
        },
      ],
      jsonSchemaResponseFormat("shopping_mission", MISSION_JSON_SCHEMA),
    );
    return parseDecomposedMission(content);
  }

  private async sendStructured(
    model: string,
    messages: Array<{ role: string; content: unknown }>,
    schemaFormat: ReturnType<typeof jsonSchemaResponseFormat>,
  ): Promise<string> {
    const preferred: JsonResponseFormat = this.useJsonSchema
      ? schemaFormat
      : { type: "json_object" };
    const requestMessages =
      preferred.type === "json_object"
        ? appendStructuredOutputHint(messages, schemaFormat.jsonSchema.schema)
        : messages;

    try {
      const response = await this.client.chat.send({
        model,
        messages: requestMessages as never,
        responseFormat: preferred as never,
        temperature: STRUCTURED_TEMPERATURE,
      });
      this.captureUsage(response);
      return this.extractContent(response);
    } catch (error) {
      if (!this.useJsonSchema || !isJsonSchemaUnsupportedError(error) || preferred.type === "json_object") {
        throw error;
      }

      const response = await this.client.chat.send({
        model,
        messages: appendStructuredOutputHint(messages, schemaFormat.jsonSchema.schema) as never,
        responseFormat: { type: "json_object" },
        temperature: STRUCTURED_TEMPERATURE,
      });
      this.captureUsage(response);
      return this.extractContent(response);
    }
  }

  private toApiResponseFormat(format: JsonResponseFormat): Record<string, unknown> {
    if (format.type === "json_object" || !this.useJsonSchema) {
      return { type: "json_object" };
    }
    return {
      type: "json_schema",
      json_schema: {
        name: format.jsonSchema.name,
        strict: format.jsonSchema.strict,
        schema: format.jsonSchema.schema,
      },
    };
  }

  private async sendChatCompletion(body: Record<string, unknown>) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      if (this.useJsonSchema && isJsonSchemaUnsupportedMessage(errorBody)) {
        const retryBody = {
          ...body,
          messages: appendStructuredOutputHint(
            (body.messages as Array<{ role: string; content: unknown }>) ?? [],
            VOICE_AUDIO_JSON_SCHEMA,
          ),
          response_format: { type: "json_object" },
        };
        const retry = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(retryBody),
        });
        if (!retry.ok) {
          throw new Error(`OpenRouter API error ${retry.status}: ${await retry.text()}`);
        }
        return (await retry.json()) as OpenRouterChatResponse;
      }
      throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`);
    }

    return (await response.json()) as OpenRouterChatResponse;
  }

  private captureUsage(response: unknown): void {
    this.lastMetrics = extractGenerationMetrics(response);
  }

  private extractContent(response: { choices?: Array<{ message?: { content?: unknown } }> }): string {
    const content = response.choices?.[0]?.message?.content;

    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object" && "text" in part) {
            return String((part as { text: string }).text);
          }
          return "";
        })
        .join("");
    }

    throw new Error("Empty response from OpenRouter");
  }
}

interface OpenRouterChatResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cost?: number;
  };
}

function extractGenerationMetrics(response: unknown): GenerationMetrics | undefined {
  if (!response || typeof response !== "object") {
    return undefined;
  }

  const record = response as Record<string, unknown>;
  const usage = record.usage;
  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  const usageRecord = usage as Record<string, unknown>;
  const promptTokens = asFiniteNumber(usageRecord.prompt_tokens ?? usageRecord.promptTokens);
  const completionTokens = asFiniteNumber(
    usageRecord.completion_tokens ?? usageRecord.completionTokens,
  );
  const totalTokens = asFiniteNumber(usageRecord.total_tokens ?? usageRecord.totalTokens);
  const cost = asFiniteNumber(usageRecord.cost ?? usageRecord.total_cost ?? usageRecord.totalCost);

  if (
    promptTokens === undefined &&
    completionTokens === undefined &&
    totalTokens === undefined &&
    cost === undefined
  ) {
    return undefined;
  }

  return { promptTokens, completionTokens, totalTokens, cost };
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function appendStructuredOutputHint(
  messages: Array<{ role: string; content: unknown }>,
  schema: Record<string, unknown>,
): Array<{ role: string; content: unknown }> {
  return [
    ...messages,
    { role: "user", content: structuredOutputInstruction(schema) },
  ];
}
