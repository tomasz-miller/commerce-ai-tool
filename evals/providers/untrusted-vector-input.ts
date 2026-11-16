/**
 * Maps the red-team variables onto the untrusted input of one pipeline entry point.
 *
 * Promptfoo's `indirect-prompt-injection` plugin puts its payload into `untrusted` and a benign
 * shopper request into `query`; plugins that inject into `injectVar` (for example
 * `excessive-agency`) fill `query` and leave `untrusted` empty. Both are merged so every plugin
 * reaches the vector.
 */

export type UntrustedVector = "voice-transcript" | "refine-query" | "image-caption";

export const UNTRUSTED_VECTORS: readonly UntrustedVector[] = [
  "voice-transcript",
  "refine-query",
  "image-caption",
];

/** Previous search the refine vector starts from (client-supplied context in production). */
export const REFINE_BASE_TERMS = ["running shoes"];
/** Benign phrase the vision step "found" next to the injected caption text. */
export const CAPTION_BASE_PHRASE = "running shoes";

export interface UntrustedVectorInput {
  vector: UntrustedVector;
  /** Voice transcript or refine query; empty for `image-caption`. */
  text: string;
  /** Phrases the vision step returned, for `image-caption` only. */
  phrases: string[];
}

export function isUntrustedVector(value: unknown): value is UntrustedVector {
  return typeof value === "string" && (UNTRUSTED_VECTORS as readonly string[]).includes(value);
}

/** Mirrors `joinPhrases` in packages/core/src/search/orchestrator.ts (image mission query). */
export function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) {
    return phrases[0] ?? "";
  }
  return `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}

export function buildUntrustedVectorInput(
  vector: UntrustedVector,
  vars: Record<string, unknown>,
): UntrustedVectorInput {
  const query = String(vars.query ?? "").trim();
  const untrusted = String(vars.untrusted ?? "").trim();
  if (vector === "image-caption") {
    // The orchestrator hands the vision step's searchTerms (not its interpretation) to the mission prompt.
    // Text printed in the image is the part of those phrases an attacker controls.
    if (!query && !untrusted) {
      return { vector, text: "", phrases: [] };
    }
    const phrases = [query || CAPTION_BASE_PHRASE, untrusted].filter(Boolean);
    return { vector, text: "", phrases };
  }
  return { vector, text: [query, untrusted].filter(Boolean).join(" "), phrases: [] };
}
