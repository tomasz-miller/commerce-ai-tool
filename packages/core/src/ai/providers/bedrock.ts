import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import type { BedrockConfig, SearchLocaleContext, VoiceAudioInterpretation } from "../../types/index.js";
import type { AIProvider } from "../types.js";
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

const DEFAULT_MODEL_ID = "anthropic.claude-3-5-sonnet-20241022-v2:0";

export class BedrockProvider implements AIProvider {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;
  private readonly visionModelId: string;

  constructor(config: BedrockConfig) {
    this.client = new BedrockRuntimeClient({ region: config.region });
    this.modelId = config.modelId ?? DEFAULT_MODEL_ID;
    this.visionModelId = config.visionModelId ?? config.modelId ?? DEFAULT_MODEL_ID;
  }

  async interpretTextQuery(text: string, locales: SearchLocaleContext) {
    const response = await this.converse(this.modelId, [
      {
        role: "user",
        content: [
          {
            text: `${TEXT_QUERY_SYSTEM_PROMPT}\n\n${buildTextQueryUserMessage(text, locales)}`,
          },
        ],
      },
    ]);

    return parseInterpretedQuery(this.extractText(response));
  }

  async interpretImageQuery(imageBase64: string, mimeType: string, locales: SearchLocaleContext) {
    const rawBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");
    const format = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpeg";

    const response = await this.converse(this.visionModelId, [
      {
        role: "user",
        content: [
          { text: `${IMAGE_QUERY_SYSTEM_PROMPT}\n\n${buildImageQueryUserMessage(locales)}` },
          {
            image: {
              format,
              source: { bytes: Buffer.from(rawBase64, "base64") },
            },
          },
        ],
      },
    ]);

    return parseInterpretedQuery(this.extractText(response));
  }

  async interpretVoiceAudio(
    _audio: Uint8Array,
    _mimeType: string,
    _locales: SearchLocaleContext,
  ): Promise<VoiceAudioInterpretation> {
    throw new Error(
      "Direct voice audio interpretation requires OpenRouter with an audio-capable model (e.g. google/gemini-2.5-flash)",
    );
  }

  async enhanceVoiceTranscript(transcript: string, locales: SearchLocaleContext) {
    const response = await this.converse(this.modelId, [
      {
        role: "user",
        content: [
          {
            text: `${VOICE_ENHANCE_SYSTEM_PROMPT}\n\n${buildVoiceEnhanceUserMessage(transcript, locales)}`,
          },
        ],
      },
    ]);

    return this.extractText(response).trim();
  }

  async summarizeVoiceResults(
    count: number,
    topProductName: string | undefined,
    locales: SearchLocaleContext,
  ) {
    const response = await this.converse(this.modelId, [
      {
        role: "user",
        content: [
          {
            text: `${TTS_SUMMARY_PROMPT}\n\n${buildTtsSummaryUserMessage(count, topProductName, locales)}`,
          },
        ],
      },
    ]);

    return this.extractText(response).trim();
  }

  private async converse(modelId: string, messages: Message[]) {
    const command = new ConverseCommand({
      modelId,
      messages,
      inferenceConfig: { maxTokens: 1024 },
    });

    return this.client.send(command);
  }

  private extractText(response: { output?: { message?: { content?: ContentBlock[] } } }): string {
    const blocks = response.output?.message?.content ?? [];
    const text = blocks.map((block) => block.text ?? "").join("");

    if (!text) {
      throw new Error("Empty response from Bedrock");
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? jsonMatch[0] : text;
  }
}
