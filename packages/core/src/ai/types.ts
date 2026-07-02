import type { InterpretedSearchQuery, SearchLocaleContext, VoiceAudioInterpretation } from "../types/index.js";

export interface AIProvider {
  interpretTextQuery(text: string, locales: SearchLocaleContext): Promise<InterpretedSearchQuery>;
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
  summarizeVoiceResults(
    count: number,
    topProductName: string | undefined,
    locales: SearchLocaleContext,
  ): Promise<string>;
}
