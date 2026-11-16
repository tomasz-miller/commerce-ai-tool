import { randomBytes } from "node:crypto";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type {
  AIProviderName,
  CartPolicy,
  CartSessionConfig,
  CommerceAIConfig,
  CommercetoolsClient,
  MissionsConfig,
  VoiceMode,
} from "@commerce-ai-tool/core";
import {
  createCommercetoolsClient,
  createSearchOrchestrator,
} from "@commerce-ai-tool/core";
import {
  isLangfuseEnabled,
  redactBinaryInput,
  resolveVoiceMode,
  withPipelineSpan,
} from "@commerce-ai-tool/core/internal";
import type { SearchOrchestrator } from "@commerce-ai-tool/core";
import {
  parseConfidenceEnv,
  parseEnumEnv,
  parsePositiveIntEnv,
} from "./env.js";
import { HttpError } from "./errors.js";
import { canonicalizeSupportedLocales } from "./utils/locale.js";

export interface CommerceAIServer {
  orchestrator: SearchOrchestrator;
  commercetools: CommercetoolsClient;
  cartDefaults: {
    currency: string;
    country?: string;
    catalogLocale: string;
  };
  /**
   * Server price-scope policy (`config.cartPolicy`), with country and currency codes upper-cased.
   * Unset: body `currency` / `country` are used as sent and fall back to `cartDefaults`.
   */
  cartPolicy?: CartPolicy;
  /**
   * Catalog locales clients may request (`CAT_SUPPORTED_LOCALES`), canonicalised at startup.
   * Unset: any well-formed locale. Never applied to `queryLocale`.
   */
  supportedLocales?: readonly string[];
  /**
   * Signing key of the customer session tokens, validated by `createCommerceAIServer` only.
   * Non-enumerable on the object it returns, so logging the server never prints it.
   */
  cartSessionSecret: string;
  /** Host revocation hooks from `config.cartSession` (`isRevoked`, `onLogout`). */
  cartSessionHooks?: Pick<CartSessionConfig, "isRevoked" | "onLogout">;
  transcribeAudio(audio: Buffer, mimeType: string): Promise<string>;
  /** `signal` cancels the provider request when the client disconnects. */
  synthesizeSpeech(text: string, signal?: AbortSignal): Promise<Buffer>;
}

export interface CommerceAIServerOptions {
  config: CommerceAIConfig;
  corsOrigins?: string | string[];
}

/** Minimum length of the customer session secret, measured in UTF-8 bytes of the trimmed value. */
export const MIN_CART_SESSION_SECRET_BYTES = 32;

/**
 * Held on `globalThis` (not in module state) because a dev server such as `next dev` re-evaluates
 * this module on a hot reload while the process lives on: module state would then mint a new
 * secret and invalidate every token issued before the reload.
 */
const EPHEMERAL_SECRET_KEY = Symbol.for("commerce-ai-tool.ephemeralCartSessionSecret");

/** The only `NODE_ENV` values that may run without a configured session secret. */
const EPHEMERAL_SECRET_ENVIRONMENTS = new Set(["development", "test"]);

/**
 * The key that signs customer session tokens. Fails closed:
 *
 * - A configured secret (`config.cartSession.secret`, from `CAT_CART_SESSION_SECRET`) must be at
 *   least {@link MIN_CART_SESSION_SECRET_BYTES} UTF-8 bytes long once trimmed, in every
 *   environment.
 * - A missing secret throws unless `NODE_ENV` is exactly `development` or `test`. Any other value,
 *   including an unset `NODE_ENV` (common for Express hosts), `staging` or `production`, throws.
 * - Only in `development` and `test` is a missing secret replaced by a random one that lives as
 *   long as the process, with one warning.
 *
 * The commercetools client secret is never used as a signing key. This check lives in
 * `createCommerceAIServer`: code that builds handlers some other way must validate its own secret.
 */
function resolveCartSessionSecret(config: CommerceAIConfig): string {
  const configured = config.cartSession?.secret?.trim();

  if (configured) {
    const bytes = Buffer.byteLength(configured, "utf8");
    if (bytes < MIN_CART_SESSION_SECRET_BYTES) {
      throw new Error(
        `CAT_CART_SESSION_SECRET (config.cartSession.secret) must be at least ${MIN_CART_SESSION_SECRET_BYTES} bytes (UTF-8); got ${bytes}. ` +
          "Generate one with: openssl rand -base64 48",
      );
    }
    return configured;
  }

  const nodeEnv = process.env.NODE_ENV;
  if (!nodeEnv || !EPHEMERAL_SECRET_ENVIRONMENTS.has(nodeEnv)) {
    throw new Error(
      "CAT_CART_SESSION_SECRET (config.cartSession.secret) is required unless NODE_ENV is \"development\" or \"test\" " +
        `(NODE_ENV is ${nodeEnv ? `"${nodeEnv}"` : "not set"}): a dedicated secret of at least ${MIN_CART_SESSION_SECRET_BYTES} bytes (UTF-8) signs customer session tokens. ` +
        "The commercetools client secret is no longer used as a fallback. Generate one with: openssl rand -base64 48",
    );
  }

  const store = globalThis as unknown as Record<symbol, string | undefined>;
  let ephemeral = store[EPHEMERAL_SECRET_KEY];
  if (!ephemeral) {
    ephemeral = randomBytes(48).toString("base64url");
    store[EPHEMERAL_SECRET_KEY] = ephemeral;
    console.warn(
      "[commerce-ai-tool/server] CAT_CART_SESSION_SECRET (config.cartSession.secret) is not set: using a random secret for this process. Customer sessions end when the server restarts. Set a dedicated secret (at least 32 bytes); every environment other than development and test refuses to start without one.",
    );
  }
  return ephemeral;
}

export function createCommerceAIServer(options: CommerceAIServerOptions): CommerceAIServer {
  const { config } = options;
  const cartSessionSecret = resolveCartSessionSecret(config);
  const voiceMode = resolveVoiceMode(config);
  const elevenlabs = config.elevenlabs ? createElevenLabsClient(config.elevenlabs) : null;
  const sttModelId = resolveSttModelId(config.elevenlabs?.sttModel);

  const cartPolicy = normalizeCartPolicy(config.cartPolicy);
  const commercetools = createCommercetoolsClient(config.commercetools, {
    payments: config.payments,
    cartPolicy,
  });
  const orchestrator = createSearchOrchestrator({
    config,
    commercetoolsClient: commercetools,
    transcribeAudio:
      voiceMode === "elevenlabs-stt" && elevenlabs
        ? async (audio, mimeType) =>
            withElevenLabsSpan("elevenlabs.stt", { audio: redactBinaryInput(mimeType, audio) }, () =>
              transcribeWithElevenLabs(elevenlabs, audio, mimeType, sttModelId),
            )
        : undefined,
  });

  const server: Omit<CommerceAIServer, "cartSessionSecret"> = {
    orchestrator,
    commercetools,
    cartDefaults: {
      currency: config.defaults?.currency ?? "EUR",
      country: config.defaults?.country,
      catalogLocale: config.defaults?.catalogLocale ?? config.defaults?.locale ?? "en",
    },
    cartPolicy,
    supportedLocales: canonicalizeSupportedLocales(config.supportedLocales),
    cartSessionHooks: {
      isRevoked: config.cartSession?.isRevoked,
      onLogout: config.cartSession?.onLogout,
    },
    async transcribeAudio(audio, mimeType) {
      if (!elevenlabs) {
        throw new HttpError(503, "UPSTREAM_UNAVAILABLE", "Voice service is not configured");
      }
      return withElevenLabsSpan(
        "elevenlabs.stt",
        { audio: redactBinaryInput(mimeType, audio) },
        () => transcribeWithElevenLabs(elevenlabs, audio, mimeType, sttModelId),
      );
    },
    async synthesizeSpeech(text, signal) {
      if (!elevenlabs) {
        throw new HttpError(503, "UPSTREAM_UNAVAILABLE", "Voice service is not configured");
      }

      return withElevenLabsSpan("elevenlabs.tts", { input: { textLength: text.length } }, async () => {
        const voiceId = config.elevenlabs?.ttsVoiceId ?? "JBFqnCBsd6RMkjVDRZzb";
        const audio = await elevenlabs.textToSpeech.convert(
          voiceId,
          {
            text,
            modelId: config.elevenlabs?.ttsModel ?? "eleven_multilingual_v2",
            outputFormat: "mp3_44100_128",
          },
          { abortSignal: signal },
        );

        const chunks: Uint8Array[] = [];
        for await (const chunk of audio as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }

        return Buffer.concat(chunks);
      });
    },
  };

  // Non-enumerable: logging or serialising the server object (`console.log(server)`, a spread,
  // JSON) must not print the signing secret. Direct reads (`server.cartSessionSecret`) still work.
  Object.defineProperty(server, "cartSessionSecret", {
    value: cartSessionSecret,
    enumerable: false,
    writable: false,
  });
  return server as CommerceAIServer;
}

function normalizeCartPolicy(policy: CartPolicy | undefined): CartPolicy | undefined {
  if (!policy) {
    return undefined;
  }
  return {
    allowedCountries: policy.allowedCountries?.map((country) => country.trim().toUpperCase()),
    currencyByCountry: policy.currencyByCountry
      ? Object.fromEntries(
          Object.entries(policy.currencyByCountry).map(([country, currency]) => [
            country.trim().toUpperCase(),
            currency.trim().toUpperCase(),
          ]),
        )
      : undefined,
  };
}

async function withElevenLabsSpan<T>(
  name: string,
  attributes: { input?: unknown; audio?: unknown },
  fn: () => Promise<T>,
): Promise<T> {
  return withPipelineSpan(
    name,
    {
      input: attributes.input ?? attributes.audio,
      metadata: { vendor: "elevenlabs" },
    },
    async (span) => {
      const result = await fn();
      if (typeof result === "string") {
        span?.update({ output: { transcriptLength: result.length } });
      } else if (Buffer.isBuffer(result)) {
        span?.update({ output: { byteLength: result.byteLength } });
      }
      return result;
    },
  );
}

function createElevenLabsClient(config: import("@commerce-ai-tool/core").ElevenLabsConfig): ElevenLabsClient {
  return new ElevenLabsClient({ apiKey: config.apiKey });
}

async function transcribeWithElevenLabs(
  elevenlabs: ElevenLabsClient,
  audio: Uint8Array,
  mimeType: string,
  modelId: SttModelId,
): Promise<string> {
  const blob = new Blob([audio], { type: mimeType });
  const result = await elevenlabs.speechToText.convert({ file: blob, modelId });

  if (typeof result === "string") {
    return result;
  }

  if ("text" in result && typeof result.text === "string") {
    return result.text;
  }

  throw new Error("Failed to transcribe audio");
}

/**
 * ElevenLabs batch speech-to-text models this server accepts. The SDK (2.77.x) types `modelId` as a
 * plain string, so the allowlist lives here. Source: ElevenLabs model overview and the
 * speech-to-text convert API reference. `scribe_v1` is deprecated upstream in favour of `scribe_v2`.
 */
export const STT_MODEL_IDS = ["scribe_v2", "scribe_v1", "scribe_v2_medical", "scribe_v3"] as const;
export type SttModelId = (typeof STT_MODEL_IDS)[number];
const DEFAULT_STT_MODEL_ID: SttModelId = "scribe_v2";

function resolveSttModelId(model: string | undefined): SttModelId {
  const trimmed = model?.trim();
  if (!trimmed) {
    return DEFAULT_STT_MODEL_ID;
  }
  const match = STT_MODEL_IDS.find((id) => id === trimmed);
  if (match) {
    return match;
  }
  console.warn(
    `[commerce-ai-tool/server] Unknown ELEVENLABS_STT_MODEL ${JSON.stringify(trimmed)}; using ${DEFAULT_STT_MODEL_ID}. Supported: ${STT_MODEL_IDS.join(", ")}`,
  );
  return DEFAULT_STT_MODEL_ID;
}

export function loadConfigFromEnv(): CommerceAIConfig {
  const provider = parseEnumEnv("CAT_AI_PROVIDER", AI_PROVIDERS, "openrouter");
  const voiceMode = parseEnumEnv("CAT_VOICE_MODE", VOICE_MODES);
  // 0 means "cache disabled" (unless CAT_CACHE_ENABLED=true), as before validation existed.
  const cacheTtlMs = parsePositiveIntEnv("CAT_CACHE_TTL_MS", undefined, { allowZero: true });
  const defaultLimit = parsePositiveIntEnv("CAT_DEFAULT_LIMIT", 20);
  const cartSessionSecret = process.env.CAT_CART_SESSION_SECRET?.trim();

  return {
    commercetools: {
      projectKey: requiredEnv("CTP_PROJECT_KEY"),
      clientId: requiredEnv("CTP_CLIENT_ID"),
      clientSecret: requiredEnv("CTP_CLIENT_SECRET"),
      region: requiredEnv("CTP_REGION"),
      scopes: parseScopesEnv(process.env.CTP_SCOPES),
      legacyProductProjectionSearch: parseBooleanEnv("CAT_LEGACY_PRODUCT_PROJECTION_SEARCH"),
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
              jsonSchema: process.env.OPENROUTER_JSON_SCHEMA === "false" ? false : undefined,
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
      country: process.env.CAT_DEFAULT_COUNTRY,
      limit: defaultLimit,
      storeKey: process.env.CAT_STORE_KEY,
    },
    supportedLocales: parseCsvEnv(process.env.CAT_SUPPORTED_LOCALES),
    voiceMode,
    voice:
      parseEnumEnv("CAT_VOICE_LLM_SUMMARY", BOOLEAN_FLAGS) === "true" ? { llmSummary: true } : undefined,
    cache: loadCacheConfig(cacheTtlMs),
    missions: loadMissionsConfig(),
    facets:
      process.env.CAT_FACETS_ENABLED === "true"
        ? {
            enabled: true,
            schemaTtlMs: parsePositiveIntEnv("CAT_FACET_SCHEMA_TTL_MS", undefined),
            include: parseCsvEnv(process.env.CAT_FACET_INCLUDE),
            exclude: parseCsvEnv(process.env.CAT_FACET_EXCLUDE),
            maxAttributes: parsePositiveIntEnv("CAT_FACET_MAX_ATTRIBUTES", undefined),
          }
        : undefined,
    payments:
      process.env.CAT_PAYMENT_REQUIRED === "true"
        ? { requiredForOrder: true }
        : process.env.CAT_PAYMENT_REQUIRED === "false"
          ? { requiredForOrder: false }
          : undefined,
    cartSession: cartSessionSecret ? { secret: cartSessionSecret } : undefined,
    langfuse: {
      enabled: isLangfuseEnabled(),
      promptsEnabled: process.env.LANGFUSE_PROMPTS === "true",
      promptLabel: process.env.LANGFUSE_PROMPT_LABEL?.trim() || undefined,
      promptCacheTtlSeconds: parsePositiveIntEnv("LANGFUSE_PROMPT_CACHE_TTL_SECONDS", undefined, {
        allowZero: true,
      }),
      promptFetchTimeoutMs: parsePositiveIntEnv("LANGFUSE_PROMPT_FETCH_TIMEOUT_MS", undefined),
      promptMaxRetries: parsePositiveIntEnv("LANGFUSE_PROMPT_MAX_RETRIES", undefined, { allowZero: true }),
    },
  };
}

const AI_PROVIDERS = ["openrouter", "bedrock"] as const satisfies readonly AIProviderName[];
const VOICE_MODES = ["openrouter-audio", "elevenlabs-stt"] as const satisfies readonly VoiceMode[];
const BOOLEAN_FLAGS = ["true", "false"] as const;

/** Builds the cache config; `CAT_CACHE_MAX_ENTRIES` is only parsed when a cache is actually built. */
function loadCacheConfig(ttlMs: number | undefined): CommerceAIConfig["cache"] {
  if (ttlMs) {
    return { ttlMs, maxEntries: parsePositiveIntEnv("CAT_CACHE_MAX_ENTRIES", undefined) };
  }
  return process.env.CAT_CACHE_ENABLED === "true"
    ? { maxEntries: parsePositiveIntEnv("CAT_CACHE_MAX_ENTRIES", undefined) }
    : undefined;
}

/** `CAT_MISSIONS_ENABLED=false` is a hard opt-out (`enabled: false`); `true` enables; unset leaves missions to the request. */
function loadMissionsConfig(): MissionsConfig | undefined {
  const flag = process.env.CAT_MISSIONS_ENABLED;
  if (flag === "false") {
    return { enabled: false };
  }
  if (flag !== "true") {
    return undefined;
  }
  return {
    enabled: true,
    maxIntents: parsePositiveIntEnv("CAT_MISSIONS_MAX_INTENTS", undefined),
    perIntentLimit: parsePositiveIntEnv("CAT_MISSIONS_PER_INTENT_LIMIT", undefined),
    minConfidence: parseConfidenceEnv("CAT_MISSIONS_MIN_CONFIDENCE"),
  };
}

/** `CTP_SCOPES`: space-separated OAuth scopes (`scope:projectKey`). Unset or blank means "none": the scope parameter is omitted. */
function parseScopesEnv(value: string | undefined): string[] | undefined {
  const scopes = value?.split(/\s+/).filter(Boolean);
  return scopes?.length ? scopes : undefined;
}

/** Strict `true`/`false`; unset or blank returns `undefined` so the config default applies. */
function parseBooleanEnv(name: string): boolean | undefined {
  const value = parseEnumEnv(name, BOOLEAN_FLAGS);
  return value === undefined ? undefined : value === "true";
}

function parseCsvEnv(value: string | undefined): string[] | undefined {
  const values = value?.split(",").map((item) => item.trim()).filter(Boolean);
  return values?.length ? values : undefined;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
