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
  /**
   * Accepted for API compatibility with the seed script; ignored.
   * Descriptions stay searchable via Product Search full-text, not Suggest keywords.
   */
  description?: LocalizedTextMap | null;
  existingSearchKeywords?: Record<string, unknown> | null;
  /** When true, rebuild even if keywords already exist. */
  force?: boolean;
};

export type BuildSearchKeywordsFromProductCopyResult =
  | { status: "skip"; reason: "existing" | "empty" }
  | { status: "ready"; searchKeywords: BuiltSearchKeywords };

const MIN_NAME_LENGTH = 2;

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
 * Build commercetools SearchKeywords from product names only.
 * Uses a whitespace tokenizer so Suggest matches word prefixes
 * (e.g. "glass" → "Chianti Wine Glass"). Description copy is not indexed here —
 * Product Search already full-texts description.
 */
export function buildSearchKeywordsFromProductCopy(
  input: BuildSearchKeywordsFromProductCopyInput,
): BuildSearchKeywordsFromProductCopyResult {
  if (!input.force && hasNonEmptySearchKeywords(input.existingSearchKeywords)) {
    return { status: "skip", reason: "existing" };
  }

  const name = input.name ?? {};
  const locales = Object.keys(name).filter((locale) => {
    const text = normalizeName(name[locale]);
    return text !== null;
  });

  if (locales.length === 0) {
    return { status: "skip", reason: "empty" };
  }

  const searchKeywords: BuiltSearchKeywords = {};

  for (const locale of locales) {
    const productName = normalizeName(name[locale]);
    if (!productName) {
      continue;
    }

    searchKeywords[locale] = [withWhitespaceTokenizer(productName)];
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

function normalizeName(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < MIN_NAME_LENGTH) {
    return null;
  }

  return trimmed;
}
