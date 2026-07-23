import { OpenRouter } from "@openrouter/sdk";
import type { FacetAttributeDefinition, OpenRouterConfig, SearchLocaleContext } from "../../types/index.js";
import type { AIProvider } from "../types.js";
import {
  buildRefineQueryUserMessage,
  buildSchemaAwareTextQueryUserMessage,
  buildImageQueryUserMessage,
  buildTextQueryUserMessage,
  buildVoiceAudioUserMessage,
  buildVoiceEnhanceUserMessage,
  buildSuggestSearchTermsUserMessage,
  IMAGE_QUERY_SYSTEM_PROMPT,
  TEXT_QUERY_SYSTEM_PROMPT,
  VOICE_AUDIO_INTERPRET_SYSTEM_PROMPT,
  VOICE_ENHANCE_SYSTEM_PROMPT,
  SUGGEST_SEARCH_TERMS_SYSTEM_PROMPT,
  parseInterpretedQuery,
  parseVoiceAudioInterpretation,
  parseSuggestSearchTerms,
} from "../../prompts/index.js";
import { mimeTypeToAudioFormat, uint8ArrayToBase64 } from "../../utils/audio.js";
import {
  buildTtsSummaryUserMessage,
  TTS_SUMMARY_PROMPT,
} from "../../search/voice-tts.js";

const DEFAULT_MODEL = "google/gemini-3.1-flash-lite-preview";
const DEFAULT_VISION_MODEL = "google/gemini-3.1-flash-lite-preview";
const DEFAULT_VOICE_MODEL = "google/gemini-2.5-flash";

export class OpenRouterProvider implements AIProvider {
  private readonly client: OpenRouter;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly visionModel: string;
  private readonly voiceModel: string;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    this.client = new OpenRouter({ apiKey: config.apiKey });
    this.model = config.model ?? DEFAULT_MODEL;
    this.visionModel = config.visionModel ?? config.model ?? DEFAULT_VISION_MODEL;
    this.voiceModel = config.voiceModel ?? DEFAULT_VOICE_MODEL;
  }

  async interpretTextQuery(
    text: string,
    locales: SearchLocaleContext,
    attributeCatalog: FacetAttributeDefinition[] = [],
  ) {
    const response = await this.client.chat.send({
      model: this.model,
      messages: [
        { role: "system", content: TEXT_QUERY_SYSTEM_PROMPT },
        {
          role: "user",
          content: attributeCatalog.length
            ? buildSchemaAwareTextQueryUserMessage(text, locales, attributeCatalog)
            : buildTextQueryUserMessage(text, locales),
        },
      ],
      responseFormat: { type: "json_object" },
    });

    const content = this.extractContent(response);
    return parseInterpretedQuery(content);
  }

  async interpretRefineQuery(
    text: string,
    context: Parameters<AIProvider["interpretRefineQuery"]>[1],
    locales: SearchLocaleContext,
  ) {
    const response = await this.client.chat.send({
      model: this.model,
      messages: [
        { role: "system", content: TEXT_QUERY_SYSTEM_PROMPT },
        { role: "user", content: buildRefineQueryUserMessage(text, locales, context) },
      ],
      responseFormat: { type: "json_object" },
    });

    return parseInterpretedQuery(this.extractContent(response));
  }

  async interpretImageQuery(imageBase64: string, mimeType: string, locales: SearchLocaleContext) {
    const dataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:${mimeType};base64,${imageBase64}`;

    const response = await this.client.chat.send({
      model: this.visionModel,
      messages: [
        { role: "system", content: IMAGE_QUERY_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: buildImageQueryUserMessage(locales) },
            { type: "image_url", imageUrl: { url: dataUrl } },
          ],
        },
      ],
      responseFormat: { type: "json_object" },
    });

    const content = this.extractContent(response);
    return parseInterpretedQuery(content);
  }

  async interpretVoiceAudio(audio: Uint8Array, mimeType: string, locales: SearchLocaleContext) {
    const format = mimeTypeToAudioFormat(mimeType);
    const base64Audio = uint8ArrayToBase64(audio);

    const response = await this.sendChatCompletion({
      model: this.voiceModel,
      messages: [
        { role: "system", content: VOICE_AUDIO_INTERPRET_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: buildVoiceAudioUserMessage(locales) },
            {
              type: "input_audio",
              input_audio: {
                data: base64Audio,
                format,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      // Gemini 2.5+ reasoning can consume most of a low max_tokens budget and truncate JSON.
      max_tokens: 4096,
      reasoning: { effort: "low" },
    });

    const content = this.extractContent(response);
    return parseVoiceAudioInterpretation(content);
  }

  async enhanceVoiceTranscript(transcript: string, locales: SearchLocaleContext) {
    const response = await this.client.chat.send({
      model: this.model,
      messages: [
        { role: "system", content: VOICE_ENHANCE_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildVoiceEnhanceUserMessage(transcript, locales),
        },
      ],
    });

    return this.extractContent(response).trim();
  }

  async suggestSearchTerms(query: string, locales: SearchLocaleContext, limit = 8) {
    const response = await this.client.chat.send({
      model: this.model,
      messages: [
        { role: "system", content: SUGGEST_SEARCH_TERMS_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildSuggestSearchTermsUserMessage(query, locales, limit),
        },
      ],
      responseFormat: { type: "json_object" },
    });

    return parseSuggestSearchTerms(this.extractContent(response), limit);
  }

  async summarizeVoiceResults(
    count: number,
    topProductName: string | undefined,
    locales: SearchLocaleContext,
  ) {
    const response = await this.client.chat.send({
      model: this.model,
      messages: [
        { role: "system", content: TTS_SUMMARY_PROMPT },
        {
          role: "user",
          content: buildTtsSummaryUserMessage(count, topProductName, locales),
        },
      ],
    });

    return this.extractContent(response).trim();
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
      throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`);
    }

    return (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
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
