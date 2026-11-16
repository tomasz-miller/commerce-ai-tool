const COMPOUND_SHOPPING_LIST_PATTERN = /\band\b|,|\bplus\b|\boraz\b/i;

/**
 * Heuristic for the search box: a new multi-item query should not be treated as
 * a facet NL refine of the previous session.
 */
export function looksLikeCompoundShoppingList(query: string): boolean {
  return COMPOUND_SHOPPING_LIST_PATTERN.test(query.trim());
}

/**
 * Words and phrases that join two products, per primary language tag. English is checked for every
 * locale: shoppers mix it in, and the image path joins catalog phrases with "and".
 */
const LIST_CONJUNCTIONS: Record<string, string[]> = {
  en: ["and", "plus", "as well as", "along with", "together with"],
  de: ["und", "sowie", "plus", "außerdem", "dazu"],
  pl: ["i", "oraz", "plus", "a także", "także"],
  fr: ["et", "plus", "ainsi que"],
  es: ["y", "e", "más", "además de", "junto con"],
  it: ["e", "ed", "più", "oltre a", "insieme a"],
  nl: ["en", "plus", "alsook", "evenals"],
};

/**
 * Separators that make a list in any language: a comma or semicolon that is not a decimal comma,
 * `&` or `+`, two non-empty lines, a bullet, or two numbered items ("1. a 2. b", "1) a 2) b").
 */
const LIST_SEPARATOR_PATTERNS: RegExp[] = [
  /(?<!\d)[,;]|[,;](?!\d)/,
  /[&+]/,
  /\S[^\S\n]*\n\s*\S/,
  /[•·▪◦]/,
  /(?:^|\s)\d+[.)]\s+\S[\s\S]*?\s\d+[.)]\s+\S/,
];

/** Fail open: a query this long may be a list without separators ("milk eggs bread"). */
const MIN_WORDS_FOR_UNSEPARATED_LIST = 3;

const conjunctionPatterns = new Map<string, RegExp>();

function conjunctionPattern(language: string): RegExp | undefined {
  const words = LIST_CONJUNCTIONS[language];
  if (!words) {
    return undefined;
  }
  let pattern = conjunctionPatterns.get(language);
  if (!pattern) {
    const alternatives = words
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"))
      .join("|");
    // Unicode-aware word boundaries: "i" must not match inside "nie", "und" not inside "Bundes".
    pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, "iu");
    conjunctionPatterns.set(language, pattern);
  }
  return pattern;
}

/**
 * Server-side gate for `decomposeShoppingMission`: true when `query` may name several products.
 * It favours recall (a false positive costs one extra LLM call, a false negative loses a mission):
 * any query of three or more words passes, so unseparated lists ("milk eggs bread") keep their
 * mission. Only one- or two-word queries without a separator or conjunction are skipped.
 * `locale` is a BCP 47 tag; its primary language picks the conjunction list (en, de, pl, fr, es,
 * it, nl). For any other language the heuristic cannot tell and returns true for a non-empty query.
 */
export function looksLikeShoppingList(query: string, locale: string): boolean {
  const text = query.trim();
  if (!text) {
    return false;
  }
  if (LIST_SEPARATOR_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }
  if (text.split(/\s+/).length >= MIN_WORDS_FOR_UNSEPARATED_LIST) {
    return true;
  }
  const language = locale.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  const local = conjunctionPattern(language);
  if (!local) {
    return true;
  }
  return local.test(text) || (language !== "en" && conjunctionPattern("en")!.test(text));
}
