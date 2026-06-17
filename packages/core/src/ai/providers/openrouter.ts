import { OpenRouter } from "@openrouter/sdk";
import type { OpenRouterConfig } from "../../types/index.js";
import type { AIProvider } from "../types.js";
import type { SearchLocaleContext } from "../../types/index.js";
import {
  buildImageQueryUserMessage,
  buildTextQueryUserMessage,
  buildVoiceEnhanceUserMessage,
  IMAGE_QUERY_SYSTEM_PROMPT,
  TEXT_QUERY_SYSTEM_PROMPT,
  VOICE_ENHANCE_SYSTEM_PROMPT,
  parseInterpretedQuery,
} from "../../prompts/index.js";
import {
  buildTtsSummaryUserMessage,
  TTS_SUMMARY_PROMPT,
} from "../../search/voice-tts.js";

const DEFAULT_MODEL = "google/gemini-2.0-flash-001";
const DEFAULT_VISION_MODEL = "google/gemini-2.0-flash-001";

export class OpenRouterProvider implements AIProvider {
  private readonly client: OpenRouter;
  private readonly model: string;
  private readonly visionModel: string;

  constructor(config: OpenRouterConfig) {
    this.client = new OpenRouter({ apiKey: config.apiKey });
    this.model = config.model ?? DEFAULT_MODEL;
    this.visionModel = config.visionModel ?? config.model ?? DEFAULT_VISION_MODEL;
  }

  async interpretTextQuery(text: string, locales: SearchLocaleContext) {
    const response = await this.client.chat.send({
      model: this.model,
      messages: [
        { role: "system", content: TEXT_QUERY_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildTextQueryUserMessage(text, locales),
        },
      ],
      responseFormat: { type: "json_object" },
    });

    const content = this.extractContent(response);
    return parseInterpretedQuery(content);
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
