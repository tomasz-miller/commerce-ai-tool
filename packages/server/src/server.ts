import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { CommerceAIConfig, VoiceMode } from "@commerce-ai-tool/core";
import { createSearchOrchestrator } from "@commerce-ai-tool/core";
import type { SearchOrchestrator } from "@commerce-ai-tool/core";

export interface CommerceAIServer {
  orchestrator: SearchOrchestrator;
  transcribeAudio(audio: Buffer, mimeType: string): Promise<string>;
  synthesizeSpeech(text: string): Promise<Buffer>;
}

export interface CommerceAIServerOptions {
  config: CommerceAIConfig;
  corsOrigins?: string | string[];
}

export function createCommerceAIServer(options: CommerceAIServerOptions): CommerceAIServer {
  const { config } = options;
  const voiceMode = resolveVoiceMode(config);
  const elevenlabs = config.elevenlabs ? createElevenLabsClient(config.elevenlabs) : null;

  const orchestrator = createSearchOrchestrator({
    config,
    transcribeAudio:
      voiceMode === "elevenlabs-stt" && elevenlabs
        ? async (audio, mimeType) => transcribeWithElevenLabs(elevenlabs, audio, mimeType, config)
        : undefined,
  });

  return {
    orchestrator,
    async transcribeAudio(audio, mimeType) {
      if (!elevenlabs) {
        throw new Error("ElevenLabs is not configured");
      }
      return transcribeWithElevenLabs(elevenlabs, audio, mimeType, config);
    },
    async synthesizeSpeech(text) {
      if (!elevenlabs) {
        throw new Error("ElevenLabs is not configured");
      }

      const voiceId = config.elevenlabs?.ttsVoiceId ?? "JBFqnCBsd6RMkjVDRZzb";
      const audio = await elevenlabs.textToSpeech.convert(voiceId, {
        text,
        modelId: config.elevenlabs?.ttsModel ?? "eleven_multilingual_v2",
        outputFormat: "mp3_44100_128",
      });

      const chunks: Uint8Array[] = [];
      for await (const chunk of audio as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    },
  };
}

function createElevenLabsClient(config: import("@commerce-ai-tool/core").ElevenLabsConfig): ElevenLabsClient {
  return new ElevenLabsClient({ apiKey: config.apiKey });
}

async function transcribeWithElevenLabs(
  elevenlabs: ElevenLabsClient,
  audio: Uint8Array,
  mimeType: string,
  config: CommerceAIConfig,
): Promise<string> {
  const blob = new Blob([audio], { type: mimeType });
  const result = await elevenlabs.speechToText.convert({
    file: blob,
    modelId: getSttModelId(config.elevenlabs?.sttModel),
  });

  if (typeof result === "string") {
    return result;
  }

  if ("text" in result && typeof result.text === "string") {
    return result.text;
  }

  throw new Error("Failed to transcribe audio");
}

function resolveVoiceMode(config: CommerceAIConfig): VoiceMode {
  if (config.voiceMode) {
    return config.voiceMode;
  }

  if (config.ai.provider === "openrouter") {
    return "openrouter-audio";
  }

  return "elevenlabs-stt";
}

function getSttModelId(model?: string): "scribe_v2" {
  return model === "scribe_v2" ? "scribe_v2" : "scribe_v2";
}

export function loadConfigFromEnv(): CommerceAIConfig {
  const provider = (process.env.CAT_AI_PROVIDER ?? "openrouter") as "openrouter" | "bedrock";
  const voiceMode = process.env.CAT_VOICE_MODE as VoiceMode | undefined;
  const cacheTtlMs = process.env.CAT_CACHE_TTL_MS
    ? Number(process.env.CAT_CACHE_TTL_MS)
    : undefined;

  return {
    commercetools: {
      projectKey: requiredEnv("CTP_PROJECT_KEY"),
      clientId: requiredEnv("CTP_CLIENT_ID"),
      clientSecret: requiredEnv("CTP_CLIENT_SECRET"),
      region: requiredEnv("CTP_REGION"),
    },
    ai: {
      provider,
      openrouter:
        provider === "openrouter"
          ? {
              apiKey: requiredEnv("OPENROUTER_API_KEY"),
              model: process.env.OPENROUTER_MODEL,
              visionModel: process.env.OPENROUTER_VISION_MODEL,
              voiceModel: process.env.OPENROUTER_VOICE_MODEL,
            }
          : undefined,
      bedrock:
        provider === "bedrock"
          ? {
              region: requiredEnv("AWS_REGION"),
              modelId: process.env.BEDROCK_MODEL_ID,
              visionModelId: process.env.BEDROCK_VISION_MODEL_ID,
            }
          : undefined,
    },
    elevenlabs: process.env.ELEVENLABS_API_KEY
      ? {
          apiKey: process.env.ELEVENLABS_API_KEY,
          sttModel: process.env.ELEVENLABS_STT_MODEL,
          ttsVoiceId: process.env.ELEVENLABS_TTS_VOICE_ID,
          ttsModel: process.env.ELEVENLABS_TTS_MODEL,
        }
      : undefined,
    defaults: {
      catalogLocale:
        process.env.CAT_CATALOG_LOCALE ?? process.env.CAT_DEFAULT_LOCALE ?? "en",
      locale: process.env.CAT_DEFAULT_LOCALE,
      currency: process.env.CAT_DEFAULT_CURRENCY ?? "EUR",
      limit: process.env.CAT_DEFAULT_LIMIT ? Number(process.env.CAT_DEFAULT_LIMIT) : 20,
      storeKey: process.env.CAT_STORE_KEY,
    },
    voiceMode,
    cache: cacheTtlMs
      ? {
          ttlMs: cacheTtlMs,
          maxEntries: process.env.CAT_CACHE_MAX_ENTRIES
            ? Number(process.env.CAT_CACHE_MAX_ENTRIES)
            : undefined,
        }
      : process.env.CAT_CACHE_ENABLED === "true"
        ? {}
        : undefined,
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
