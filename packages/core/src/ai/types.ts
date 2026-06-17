import type { InterpretedSearchQuery } from "../types/index.js";

export interface AIProvider {
  interpretTextQuery(text: string, locale: string): Promise<InterpretedSearchQuery>;
  interpretImageQuery(
    imageBase64: string,
    mimeType: string,
    locale: string,
  ): Promise<InterpretedSearchQuery>;
  enhanceVoiceTranscript(transcript: string, locale: string): Promise<string>;
}
