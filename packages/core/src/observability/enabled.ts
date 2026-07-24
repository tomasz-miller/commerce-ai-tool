/** Opt-in Langfuse: both public and secret keys must be set. */
export function isLangfuseEnabled(): boolean {
  return Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
}

/**
 * Opt-in Langfuse prompt management: keys required and LANGFUSE_PROMPTS=true.
 * When disabled, AI providers use local catalog strings only.
 */
export function isLangfusePromptsEnabled(): boolean {
  return isLangfuseEnabled() && process.env.LANGFUSE_PROMPTS === "true";
}

/** Expose OTel trace id on search meta for local/dev linking. */
export function shouldExposeTraceId(): boolean {
  return isLangfuseEnabled() || process.env.CAT_DEBUG === "true";
}

/**
 * Autocomplete keystrokes are high-volume and AI-free. Off by default so Langfuse
 * stays focused on text / voice / image search. Set LANGFUSE_TRACE_SUGGESTIONS=true to enable.
 */
export function shouldTraceSuggestions(): boolean {
  return isLangfuseEnabled() && process.env.LANGFUSE_TRACE_SUGGESTIONS === "true";
}
