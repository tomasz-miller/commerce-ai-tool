/** Localized string map as returned by commercetools (locale → text). */
export type LocalizedTextMap = Record<string, string | undefined | null>;

export type WhitespaceSearchKeyword = {
  text: string;
  suggestTokenizer: { type: "whitespace" };
};

/** commercetools SearchKeywords payload for setSearchKeywords. */
export type BuiltSearchKeywords = Record<string, WhitespaceSearchKeyword[]>;

export type BuildSearchKeywordsFromProductCopyInput = {
  name?: LocalizedTextMap | null;
  description?: LocalizedTextMap | null;
  existingSearchKeywords?: Record<string, unknown> | null;
  /** When true, rebuild even if keywords already exist. */
  force?: boolean;
};

export type BuildSearchKeywordsFromProductCopyResult =
  | { status: "skip"; reason: "existing" | "empty" }
  | { status: "ready"; searchKeywords: BuiltSearchKeywords };

const MIN_PHRASE_LENGTH = 2;
const MAX_DESCRIPTION_PHRASES = 2;
const MAX_PHRASE_LENGTH = 80;

/** Light English/German function-word filter for description phrase quality. */
const DESCRIPTION_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "das",
  "dem",
  "den",
  "der",
  "des",
  "die",
  "ein",
  "eine",
  "for",
  "from",
  "in",
  "is",
  "it",
  "mit",
  "of",
  "on",
  "or",
  "the",
  "this",
  "to",
  "und",
  "von",
  "with",
]);

export function hasNonEmptySearchKeywords(
  existing: Record<string, unknown> | null | undefined,
): boolean {
  if (!existing || typeof existing !== "object") {
    return false;
  }

  return Object.values(existing).some(
    (value) => Array.isArray(value) && value.length > 0,
  );
}

/**
 * Build commercetools SearchKeywords from product name/description copy.
 * Primary keyword is the localized name with a whitespace tokenizer so Suggest
 * matches word prefixes (e.g. "glass" → "Chianti Wine Glass").
 */
export function buildSearchKeywordsFromProductCopy(
  input: BuildSearchKeywordsFromProductCopyInput,
): BuildSearchKeywordsFromProductCopyResult {
  if (!input.force && hasNonEmptySearchKeywords(input.existingSearchKeywords)) {
    return { status: "skip", reason: "existing" };
  }

  const name = input.name ?? {};
  const description = input.description ?? {};
  const locales = Object.keys(name).filter((locale) => {
    const text = normalizePhrase(name[locale]);
    return text !== null;
  });

  if (locales.length === 0) {
    return { status: "skip", reason: "empty" };
  }

  const searchKeywords: BuiltSearchKeywords = {};

  for (const locale of locales) {
    const productName = normalizePhrase(name[locale]);
    if (!productName) {
      continue;
    }

    const keywords: WhitespaceSearchKeyword[] = [
      withWhitespaceTokenizer(productName),
    ];
    const seen = new Set([productName.toLowerCase()]);

    const descriptionText = typeof description[locale] === "string" ? description[locale] : "";
    for (const phrase of extractDescriptionPhrases(descriptionText ?? "", productName)) {
      const key = phrase.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      keywords.push(withWhitespaceTokenizer(phrase));
    }

    searchKeywords[locale] = keywords;
  }

  if (Object.keys(searchKeywords).length === 0) {
    return { status: "skip", reason: "empty" };
  }

  return { status: "ready", searchKeywords };
}

function withWhitespaceTokenizer(text: string): WhitespaceSearchKeyword {
  return {
    text,
    suggestTokenizer: { type: "whitespace" },
  };
}

function normalizePhrase(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < MIN_PHRASE_LENGTH) {
    return null;
  }

  return trimmed;
}

function extractDescriptionPhrases(description: string, productName: string): string[] {
  const sentences = description
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const phrases: string[] = [];

  for (const sentence of sentences) {
    if (phrases.length >= MAX_DESCRIPTION_PHRASES) {
      break;
    }

    let phrase = sentence.replace(/\s+/g, " ").trim();
    if (phrase.length > MAX_PHRASE_LENGTH) {
      const truncated = phrase.slice(0, MAX_PHRASE_LENGTH).replace(/\s+\S*$/, "").trim();
      phrase = truncated.length >= MIN_PHRASE_LENGTH ? truncated : phrase.slice(0, MAX_PHRASE_LENGTH).trim();
    }

    if (phrase.length < MIN_PHRASE_LENGTH) {
      continue;
    }

    if (phrase.toLowerCase() === productName.toLowerCase()) {
      continue;
    }

    if (!hasMeaningfulToken(phrase)) {
      continue;
    }

    phrases.push(phrase);
  }

  return phrases;
}

function hasMeaningfulToken(phrase: string): boolean {
  const tokens = phrase
    .toLowerCase()
    .split(/[^a-z0-9äöüß-]+/i)
    .filter(Boolean);

  return tokens.some(
    (token) => token.length >= MIN_PHRASE_LENGTH && !DESCRIPTION_STOPWORDS.has(token),
  );
}
