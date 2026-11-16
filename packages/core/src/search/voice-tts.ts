import type { SearchLocaleContext } from "../types/index.js";

/**
 * Max characters of spoken summary text. The server's `/tts` route rejects longer text, so
 * server-issued `ttsText` is truncated to this length before it reaches the widget.
 */
export const MAX_TTS_CHARS = 500;

/**
 * Trims `text` and cuts it to at most `max` characters: at the last sentence end
 * (`.`, `!`, `?`, `…`) within the cap, else at the last word boundary, else hard.
 */
export function truncateTtsText(text: string, max: number = MAX_TTS_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }

  const window = trimmed.slice(0, max);
  const sentenceEnd = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
    window.lastIndexOf("… "),
  );
  if (sentenceEnd > 0) {
    return window.slice(0, sentenceEnd + 1);
  }
  // The cut may land exactly on a sentence end followed by a space beyond the window.
  if (/[.!?…]$/.test(window) && /\s/.test(trimmed.charAt(max))) {
    return window;
  }

  const wordEnd = window.search(/\s\S*$/);
  if (wordEnd > 0) {
    return window.slice(0, wordEnd).trimEnd();
  }

  // Do not split a surrogate pair (for example an emoji) on a hard cut.
  const lastCode = window.charCodeAt(window.length - 1);
  return lastCode >= 0xd800 && lastCode <= 0xdbff ? window.slice(0, -1) : window;
}

export function buildTtsSummaryUserMessage(
  count: number,
  topProductName: string | undefined,
  locales: SearchLocaleContext,
): string {
  const lines = [
    `User query language: ${locales.queryLocale}`,
    `Product catalog language: ${locales.catalogLocale}`,
    `Number of results: ${count}`,
  ];

  if (topProductName) {
    lines.push(`Top product name (catalog language): ${topProductName}`);
  }

  lines.push(`Write the summary in ${locales.queryLocale} only.`);

  return lines.join("\n");
}

interface FallbackMessages {
  none: string;
  one: (name: string) => string;
  many: (count: number) => string;
  manyWithTop: (count: number, name: string) => string;
}

const FALLBACK_MESSAGES: Record<string, FallbackMessages> = {
  pl: {
    none: "Nie znaleziono produktów dla tego wyszukiwania.",
    one: (name) => `Znaleziono 1 produkt. Najlepszy wynik: ${name}.`,
    many: (n) => `Znaleziono ${n} produktów.`,
    manyWithTop: (n, name) => `Znaleziono ${n} produktów. Najlepszy wynik: ${name}.`,
  },
  en: {
    none: "No products found for your search.",
    one: (name) => `Found 1 product. Top result: ${name}.`,
    many: (n) => `Found ${n} products.`,
    manyWithTop: (n, name) => `Found ${n} products. Top result: ${name}.`,
  },
  no: {
    none: "Ingen produkter funnet for søket ditt.",
    one: (name) => `Fant 1 produkt. Toppresultat: ${name}.`,
    many: (n) => `Fant ${n} produkter.`,
    manyWithTop: (n, name) => `Fant ${n} produkter. Toppresultat: ${name}.`,
  },
  de: {
    none: "Keine Produkte für Ihre Suche gefunden.",
    one: (name) => `1 Produkt gefunden. Bestes Ergebnis: ${name}.`,
    many: (n) => `${n} Produkte gefunden.`,
    manyWithTop: (n, name) => `${n} Produkte gefunden. Bestes Ergebnis: ${name}.`,
  },
};

export function buildTtsSummaryFallback(
  count: number,
  topProductName: string | undefined,
  queryLocale: string,
): string {
  const locale = queryLocale.toLowerCase().split("-")[0] ?? "en";
  const messages = FALLBACK_MESSAGES[locale] ?? FALLBACK_MESSAGES.en!;

  if (count === 0) {
    return messages.none;
  }

  if (topProductName) {
    return count === 1
      ? messages.one(topProductName)
      : messages.manyWithTop(count, topProductName);
  }

  return messages.many(count);
}
