/** Models used when the host config does not name one. Shared with trace metadata. */
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.6-luna";
export const DEFAULT_OPENROUTER_VISION_MODEL = "google/gemini-3.7-flash";
export const DEFAULT_OPENROUTER_VOICE_MODEL = "google/gemini-3.7-flash";
/**
 * Legacy model kept as the 2.x default: a `global.` inference profile would route requests to any
 * commercial Region and silently move hosts with data-residency needs. Changing it is a 3.0.0
 * decision; hosts should set BEDROCK_MODEL_ID (see docs/CONFIGURATION.md).
 */
export const DEFAULT_BEDROCK_MODEL = "anthropic.claude-3-5-sonnet-20241022-v2:0";

/**
 * Output-token cap per AI task (`maxCompletionTokens`). The cap includes reasoning tokens (calls
 * run at `reasoning.effort: "low"`), so it is well above the visible answer size. A response cut
 * by the cap (`finishReason: "length"`) throws `AIOutputTruncatedError`. Tune with
 * `pnpm eval:promptfoo`, `:voice-enhance` and `:voice-tts`.
 */
export const MAX_TOKENS = {
  interpret: 2000,
  mission: 2000,
  suggest: 1000,
  refine: 2000,
  image: 2000,
  voiceAudio: 2000,
  voiceTranscript: 2000,
  enhance: 600,
  ttsSummary: 600,
} as const;

export type AITask = keyof typeof MAX_TOKENS;
