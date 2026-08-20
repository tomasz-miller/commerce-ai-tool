/**
 * Autocomplete should surface short search phrases / product names,
 * not truncated marketing descriptions from searchKeywords.
 */

/** Soft cap for a single suggestion string. */
export const SUGGESTION_MAX_LENGTH = 50;

/** Soft cap for whitespace-separated tokens. */
export const SUGGESTION_MAX_WORDS = 6;

const SENTENCE_LIKE =
  /^(the|a|an|this|these|that|those)\b.+\b(is|are|was|were|also|designed|known|allows|features|provides|made|used)\b/i;

/**
 * True when the text looks like a short catalog search phrase suitable for autocomplete.
 */
export function isSuggestiblePhrase(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return false;
  }

  if (normalized.length > SUGGESTION_MAX_LENGTH) {
    return false;
  }

  const words = normalized.split(" ").filter(Boolean);
  if (words.length > SUGGESTION_MAX_WORDS) {
    return false;
  }

  if (SENTENCE_LIKE.test(normalized)) {
    return false;
  }

  // Truncated mid-sentence fragments often end with a dangling function word.
  const lastWord = words[words.length - 1]?.toLowerCase() ?? "";
  if (
    words.length >= 4 &&
    ["of", "the", "a", "an", "to", "for", "and", "or", "with"].includes(lastWord)
  ) {
    return false;
  }

  return true;
}
