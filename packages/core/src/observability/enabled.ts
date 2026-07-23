/** Opt-in Langfuse: both public and secret keys must be set. */
export function isLangfuseEnabled(): boolean {
  return Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
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
