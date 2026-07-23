import type {
  FacetAttributeDefinition,
  InterpretedSearchFilters,
  InterpretedSearchQuery,
  SearchLocaleContext,
  VoiceAudioInterpretation,
} from "../types/index.js";

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
  ): Promise<InterpretedSearchQuery>;
  interpretVoiceAudio(
    audio: Uint8Array,
    mimeType: string,
    locales: SearchLocaleContext,
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
}
