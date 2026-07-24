import {
  IMAGE_QUERY_SYSTEM_PROMPT,
  SUGGEST_SEARCH_TERMS_SYSTEM_PROMPT,
  TEXT_QUERY_SYSTEM_PROMPT,
  TTS_SUMMARY_PROMPT,
  VOICE_AUDIO_INTERPRET_SYSTEM_PROMPT,
  VOICE_ENHANCE_SYSTEM_PROMPT,
} from "./index.js";

/** Stable Langfuse prompt names (git catalog ↔ managed prompts). */
export const SYSTEM_PROMPT_NAMES = {
  TEXT_QUERY: "commerce-ai/text-query",
  IMAGE_QUERY: "commerce-ai/image-query",
  VOICE_ENHANCE: "commerce-ai/voice-enhance",
  VOICE_AUDIO_INTERPRET: "commerce-ai/voice-audio-interpret",
  SUGGEST_SEARCH_TERMS: "commerce-ai/suggest-search-terms",
  TTS_SUMMARY: "commerce-ai/tts-summary",
} as const;

export type SystemPromptName = (typeof SYSTEM_PROMPT_NAMES)[keyof typeof SYSTEM_PROMPT_NAMES];

/** Local fallback strings keyed by Langfuse prompt name. */
export const SYSTEM_PROMPT_CATALOG: Record<SystemPromptName, string> = {
  [SYSTEM_PROMPT_NAMES.TEXT_QUERY]: TEXT_QUERY_SYSTEM_PROMPT,
  [SYSTEM_PROMPT_NAMES.IMAGE_QUERY]: IMAGE_QUERY_SYSTEM_PROMPT,
  [SYSTEM_PROMPT_NAMES.VOICE_ENHANCE]: VOICE_ENHANCE_SYSTEM_PROMPT,
  [SYSTEM_PROMPT_NAMES.VOICE_AUDIO_INTERPRET]: VOICE_AUDIO_INTERPRET_SYSTEM_PROMPT,
  [SYSTEM_PROMPT_NAMES.SUGGEST_SEARCH_TERMS]: SUGGEST_SEARCH_TERMS_SYSTEM_PROMPT,
  [SYSTEM_PROMPT_NAMES.TTS_SUMMARY]: TTS_SUMMARY_PROMPT,
};

export function getLocalSystemPrompt(name: SystemPromptName): string {
  return SYSTEM_PROMPT_CATALOG[name];
}

export function listSystemPromptEntries(): Array<{ name: SystemPromptName; prompt: string }> {
  return (Object.keys(SYSTEM_PROMPT_CATALOG) as SystemPromptName[]).map((name) => ({
    name,
    prompt: SYSTEM_PROMPT_CATALOG[name],
  }));
}
