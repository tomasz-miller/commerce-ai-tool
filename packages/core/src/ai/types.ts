import type {
  DecomposedShoppingMission,
  FacetAttributeDefinition,
  InterpretedSearchFilters,
  InterpretedSearchQuery,
  SearchLocaleContext,
  VoiceAudioInterpretation,
} from "../types/index.js";

export interface GenerationMetrics {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
}

export interface AIProvider {
  interpretTextQuery(
    text: string,
    locales: SearchLocaleContext,
    attributeCatalog?: FacetAttributeDefinition[],
  ): Promise<InterpretedSearchQuery>;
  interpretRefineQuery(
    text: string,
    context: {
      searchTerms: string[];
      filters: InterpretedSearchFilters;
      attributeCatalog: FacetAttributeDefinition[];
    },
    locales: SearchLocaleContext,
  ): Promise<InterpretedSearchQuery>;
  interpretImageQuery(
    imageBase64: string,
    mimeType: string,
    locales: SearchLocaleContext,
    attributeCatalog?: FacetAttributeDefinition[],
  ): Promise<InterpretedSearchQuery>;
  interpretVoiceAudio(
    audio: Uint8Array,
    mimeType: string,
    locales: SearchLocaleContext,
    attributeCatalog?: FacetAttributeDefinition[],
  ): Promise<VoiceAudioInterpretation>;
  enhanceVoiceTranscript(transcript: string, locales: SearchLocaleContext): Promise<string>;
  suggestSearchTerms(
    query: string,
    locales: SearchLocaleContext,
    limit?: number,
  ): Promise<string[]>;
  summarizeVoiceResults(
    count: number,
    topProductName: string | undefined,
    locales: SearchLocaleContext,
  ): Promise<string>;
  decomposeShoppingMission(
    text: string,
    locales: SearchLocaleContext,
    attributeCatalog?: FacetAttributeDefinition[],
  ): Promise<DecomposedShoppingMission>;
  getLastGenerationMetrics?(): GenerationMetrics | undefined;
}
