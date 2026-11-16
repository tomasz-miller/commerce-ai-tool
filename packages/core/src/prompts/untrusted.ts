import { logSearchTrace } from "../utils/dev-trace.js";

/**
 * Delimiting for untrusted text (shopper queries, speech transcripts, client-supplied search
 * context) that is placed into a user message. The value is cut to `maxChars`, JSON-encoded and
 * wrapped in a tag that SAFETY_RULES declares to be data, never instructions.
 */

export type UntrustedTag = "user_query" | "refine_query" | "transcript" | "previous_terms";

/**
 * Max characters of a shopper query or refinement that reach a prompt. The server rejects longer
 * `query` and `refineQuery` values with a 400 using the same limit (`MAX_QUERY_CHARS` in
 * `@commerce-ai-tool/server`, which re-exports this constant).
 */
export const MAX_QUERY_CHARS = 300;
/** Max characters of a speech-to-text transcript that reach the voice-enhance prompt. */
export const MAX_TRANSCRIPT_PROMPT_CHARS = 2000;
/** Max characters of client-supplied previous search terms and filters in a refine prompt. */
export const MAX_PREVIOUS_TERMS_PROMPT_CHARS = 500;

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  const cut = value.slice(0, maxChars);
  // Do not leave half a surrogate pair (for example an emoji) at the cut.
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/**
 * Returns `<tag>${JSON.stringify(truncated)}</tag>`. JSON.stringify escapes quotes, backslashes
 * and line breaks but not `<`, so `<` is escaped to `<` as well: the encoded value never
 * contains a literal closing tag, and JSON.parse still restores the original text.
 */
export function wrapUntrusted(tag: UntrustedTag, value: string, maxChars: number): string {
  const capped = truncate(value, maxChars);
  if (capped.length < value.length) {
    // Lengths only, never the text: makes silent tail loss visible under CAT_DEBUG.
    logSearchTrace("prompt_input_truncated", {
      tag,
      originalLength: value.length,
      cappedLength: capped.length,
    });
  }
  const encoded = JSON.stringify(capped).replace(/</g, "\\u003c");
  return `<${tag}>${encoded}</${tag}>`;
}
