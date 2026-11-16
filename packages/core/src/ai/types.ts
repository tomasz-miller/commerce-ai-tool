import type {
  DecomposedShoppingMission,
  FacetAttributeDefinition,
  InterpretedSearchFilters,
  InterpretedSearchQuery,
  SearchLocaleContext,
  VoiceAudioInterpretation,
  VoiceTranscriptInterpretation,
} from "../types/index.js";

/** What a single provider call reports about itself, scoped to that call. */
export interface AICallMetrics {
  /** Model the provider actually used (the response's model when it echoes one). */
  model: string;
  usage?: { input: number; output: number; total: number; cacheRead?: number };
  costUsd?: number;
  finishReason?: string;
}

/** Per-call options. Metrics are reported through the callback, never through shared state. */
export interface AICallOptions {
  /**
   * Cancels the provider request. The orchestrator passes one per step: it aborts on the step
   * timeout and when the host request is aborted.
   */
  signal?: AbortSignal;
  onMetrics?: (m: AICallMetrics) => void;
}

export interface AIProvider {
  interpretTextQuery(
    text: string,
    locales: SearchLocaleContext,
    attributeCatalog?: FacetAttributeDefinition[],
    options?: AICallOptions,
  ): Promise<InterpretedSearchQuery>;
  interpretRefineQuery(
    text: string,
    context: {
      searchTerms: string[];
      filters: InterpretedSearchFilters;
      attributeCatalog: FacetAttributeDefinition[];
    },
    locales: SearchLocaleContext,
    options?: AICallOptions,
  ): Promise<InterpretedSearchQuery>;
  interpretImageQuery(
    imageBase64: string,
    mimeType: string,
    locales: SearchLocaleContext,
    attributeCatalog?: FacetAttributeDefinition[],
    options?: AICallOptions,
  ): Promise<InterpretedSearchQuery>;
  interpretVoiceAudio(
    audio: Uint8Array,
    mimeType: string,
    locales: SearchLocaleContext,
    attributeCatalog?: FacetAttributeDefinition[],
    options?: AICallOptions,
  ): Promise<VoiceAudioInterpretation>;
  /**
   * Cleans an STT transcript into a search phrase (free text). The ElevenLabs voice path uses
   * `interpretVoiceTranscript` instead when the provider implements it.
   */
  enhanceVoiceTranscript(
    transcript: string,
    locales: SearchLocaleContext,
    options?: AICallOptions,
  ): Promise<string>;
  /**
   * One structured call over an STT transcript: `enhancedQuery` plus the interpreted search
   * (prompt `commerce-ai/voice-transcript-interpret`). Optional so custom providers written for
   * earlier 2.x releases keep compiling; without it the orchestrator calls
   * `enhanceVoiceTranscript` then `interpretTextQuery`.
   */
  interpretVoiceTranscript?(
    transcript: string,
    locales: SearchLocaleContext,
    attributeCatalog?: FacetAttributeDefinition[],
    options?: AICallOptions,
  ): Promise<VoiceTranscriptInterpretation>;
  suggestSearchTerms(
    query: string,
    locales: SearchLocaleContext,
    limit?: number,
    options?: AICallOptions,
  ): Promise<string[]>;
  summarizeVoiceResults(
    count: number,
    topProductName: string | undefined,
    locales: SearchLocaleContext,
    options?: AICallOptions,
  ): Promise<string>;
  decomposeShoppingMission(
    text: string,
    locales: SearchLocaleContext,
    attributeCatalog?: FacetAttributeDefinition[],
    options?: AICallOptions,
  ): Promise<DecomposedShoppingMission>;
}
