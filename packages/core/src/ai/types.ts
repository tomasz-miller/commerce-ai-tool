import type { InterpretedSearchQuery, SearchLocaleContext } from "../types/index.js";

export interface AIProvider {
  interpretTextQuery(text: string, locales: SearchLocaleContext): Promise<InterpretedSearchQuery>;
  interpretImageQuery(
    imageBase64: string,
    mimeType: string,
    locales: SearchLocaleContext,
  ): Promise<InterpretedSearchQuery>;
  enhanceVoiceTranscript(transcript: string, locales: SearchLocaleContext): Promise<string>;
  summarizeVoiceResults(
    count: number,
    topProductName: string | undefined,
    locales: SearchLocaleContext,
  ): Promise<string>;
}
