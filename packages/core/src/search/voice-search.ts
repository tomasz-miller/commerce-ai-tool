import type { AIProvider } from "../ai/types.js";
import { buildVoiceSearchCacheKey } from "../cache/search-cache.js";
import { withPropagatedAttributes, withTraceIdMeta } from "../observability/index.js";
import { logSearchTrace } from "../utils/dev-trace.js";
import { hashUint8Array } from "../utils/hash.js";
import { createSearchTimer } from "../utils/search-timer.js";
import { withTimeout } from "../utils/with-timeout.js";
import type {
  FacetAttributeDefinition,
  SearchLocaleContext,
  SearchLocaleOptions,
  VoiceAudioInterpretation,
  VoiceSearchResult,
} from "../types/index.js";
import { resolveLocales, tryResolveFacetSchema, withTimings } from "./context.js";
import type { PipelineContext } from "./context.js";
import { looksLikeShoppingList, resolveMissionOptions } from "./mission.js";
import { searchWithOptionalMission } from "./mission-search.js";
import { executeSearch } from "./product-search.js";
import { buildTtsSummaryFallback, truncateTtsText } from "./voice-tts.js";

/**
 * Thrown by `searchByVoice` when no speech-to-text backend is configured. The message names
 * the config switches for the host's logs; hosts map it to 503 and do not send it to browsers.
 */
export class VoiceNotConfiguredError extends Error {
  constructor() {
    super(
      "Voice search requires ElevenLabs STT (CAT_VOICE_MODE=elevenlabs-stt) or OpenRouter audio (CAT_VOICE_MODE=openrouter-audio)",
    );
    this.name = "VoiceNotConfiguredError";
  }
}

export interface VoiceSearchRequest {
  audio: Uint8Array;
  mimeType: string;
}

export type VoiceSearchOptions = SearchLocaleOptions & {
  limit?: number;
  enableTts?: boolean;
  enableMissions?: boolean;
  /** Aborts every remaining step, including in-flight AI calls. */
  signal?: AbortSignal;
};

export async function searchByVoice(
  ctx: PipelineContext,
  request: VoiceSearchRequest,
  options: VoiceSearchOptions = {},
): Promise<VoiceSearchResult & { ttsText?: string }> {
  const { config, ai, timeouts, voiceMode } = ctx;
  const { limit } = ctx.defaults;
  const voiceResultCache = ctx.caches.voiceResult;
  const { audio, mimeType } = request;
  const { signal } = options;
  const locales = resolveLocales(ctx, options);
  const searchLimit = options.limit ?? limit;
  const timer = createSearchTimer();

  const pipelineMeta = {
    queryLocale: locales.queryLocale,
    catalogLocale: locales.catalogLocale,
    searchType: "voice",
    projectKey: config.commercetools.projectKey,
    aiProvider: config.ai.provider,
    voiceMode,
  };

  logSearchTrace("input", {
    type: "voice",
    mimeType,
    voiceMode,
    queryLocale: locales.queryLocale,
    catalogLocale: locales.catalogLocale,
  });

  return withPropagatedAttributes(pipelineMeta, async () => {
    const enableTts = options.enableTts !== false;
    const missionOptions = resolveMissionOptions(config.missions, options.enableMissions);
    const voiceCacheKey = buildVoiceSearchCacheKey(
      hashUint8Array(audio),
      mimeType,
      voiceMode,
      locales.queryLocale,
      locales.catalogLocale,
      searchLimit,
      enableTts,
      missionOptions.enabled,
    );
    const cachedVoice = voiceResultCache?.get(voiceCacheKey);
    if (cachedVoice) {
      timer.mark("cache_hit");
      return withTraceIdMeta(withTimings(cachedVoice, timer));
    }

    const resolvedSchema = await tryResolveFacetSchema(ctx, locales);
    const attributeCatalog = resolvedSchema?.attributes ?? [];
    const facetSchema = config.facets?.enabled ? resolvedSchema : undefined;
    const voiceInterpretation = await interpretVoice(
      ctx,
      request,
      locales,
      timer,
      attributeCatalog,
      signal,
    );
    const { transcript, enhancedQuery, ...interpreted } = voiceInterpretation;
    const spokenQuery = enhancedQuery || transcript;
    // The transcript is checked too: the cleanup can drop the separators of a spoken list
    // ("milk and eggs" -> "milk eggs").
    const spokenList =
      missionOptions.enabled &&
      (looksLikeShoppingList(transcript, locales.queryLocale) ||
        looksLikeShoppingList(spokenQuery, locales.queryLocale));
    const result = await searchWithOptionalMission(
      ctx,
      spokenList ? spokenQuery : undefined,
      () =>
        executeSearch(ctx, interpreted, {
          locales,
          limit: searchLimit,
          offset: 0,
          timer,
          facetSchema,
          originalQuery: spokenQuery,
          signal,
        }),
      { locales, timer, missionOptions, attributeCatalog, signal },
    );

    const voiceResult: VoiceSearchResult & { ttsText?: string } = {
      ...result,
      transcript,
      enhancedQuery,
    };

    const withTts = await attachVoiceTts(
      voiceResult,
      options,
      config.voice?.llmSummary === true,
      locales,
      ai,
      timer,
      timeouts.aiTextMs,
      signal,
    );
    signal?.throwIfAborted();
    voiceResultCache?.set(voiceCacheKey, withTts);
    return withTraceIdMeta(withTimings(withTts, timer));
  });
}

async function interpretVoice(
  ctx: PipelineContext,
  request: VoiceSearchRequest,
  locales: SearchLocaleContext,
  timer: ReturnType<typeof createSearchTimer>,
  attributeCatalog: FacetAttributeDefinition[] = [],
  signal?: AbortSignal,
): Promise<VoiceAudioInterpretation> {
  const { config, ai, timeouts, voiceMode } = ctx;
  const { audio, mimeType } = request;
  if (voiceMode === "openrouter-audio") {
    if (config.ai.provider !== "openrouter") {
      throw new Error("CAT_VOICE_MODE=openrouter-audio requires CAT_AI_PROVIDER=openrouter");
    }

    const result = await withTimeout(
      (stepSignal) =>
        ai.interpretVoiceAudio(audio, mimeType, locales, attributeCatalog, { signal: stepSignal }),
      timeouts.aiVoiceAudioMs,
      "ai_voice_audio",
      signal,
    );
    timer.mark("ai_voice_audio");
    return result;
  }

  if (!ctx.transcribeAudio) {
    throw new VoiceNotConfiguredError();
  }

  const transcribeAudio = ctx.transcribeAudio;
  const transcript = await withTimeout(
    () => transcribeAudio(audio, mimeType),
    timeouts.aiVoiceAudioMs,
    "stt",
    signal,
  );
  timer.mark("stt");

  if (ai.interpretVoiceTranscript) {
    const interpretVoiceTranscript = ai.interpretVoiceTranscript.bind(ai);
    // One structured call: enhanced query plus interpretation (was enhance, then interpret).
    const { enhancedQuery, ...interpreted } = await withTimeout(
      (stepSignal) =>
        interpretVoiceTranscript(transcript, locales, attributeCatalog, { signal: stepSignal }),
      timeouts.aiTextMs,
      "ai_voice_transcript",
      signal,
    );
    timer.mark("ai_voice_transcript");
    return {
      transcript,
      enhancedQuery: enhancedQuery || transcript.trim(),
      ...interpreted,
    };
  }

  const enhancedQuery = await withTimeout(
    (stepSignal) => ai.enhanceVoiceTranscript(transcript, locales, { signal: stepSignal }),
    timeouts.aiTextMs,
    "ai_enhance",
    signal,
  );
  timer.mark("ai_enhance");

  const interpreted = await withTimeout(
    (stepSignal) =>
      ai.interpretTextQuery(enhancedQuery, locales, attributeCatalog, { signal: stepSignal }),
    timeouts.aiTextMs,
    "ai_interpret",
    signal,
  );
  timer.mark("ai_interpret");

  return {
    transcript,
    enhancedQuery,
    ...interpreted,
  };
}

async function attachVoiceTts(
  result: VoiceSearchResult & { ttsText?: string },
  options: { enableTts?: boolean },
  llmSummary: boolean,
  locales: SearchLocaleContext,
  ai: AIProvider,
  timer: ReturnType<typeof createSearchTimer>,
  aiTextTimeoutMs: number,
  signal?: AbortSignal,
): Promise<VoiceSearchResult & { ttsText?: string }> {
  if (options.enableTts === false) {
    return result;
  }

  // ttsText is posted back to `/tts`, which rejects text over MAX_TTS_CHARS: cap it here.
  if (result.ttsText) {
    return { ...result, ttsText: truncateTtsText(result.ttsText) };
  }

  const fallback = () =>
    truncateTtsText(
      buildTtsSummaryFallback(result.products.length, result.products[0]?.name, locales.queryLocale),
    );

  // Deterministic by default: the LLM only rephrases the same one-sentence summary.
  if (!llmSummary) {
    timer.mark("tts_summary");
    return { ...result, ttsText: fallback() };
  }

  try {
    const ttsText = await withTimeout(
      (stepSignal) =>
        ai.summarizeVoiceResults(result.products.length, result.products[0]?.name, locales, {
          signal: stepSignal,
        }),
      aiTextTimeoutMs,
      "ai_tts_summary",
      signal,
    );
    timer.mark("ai_tts_summary");
    return { ...result, ttsText: truncateTtsText(ttsText) };
  } catch {
    timer.mark("ai_tts_summary_fallback");
    return { ...result, ttsText: fallback() };
  }
}
