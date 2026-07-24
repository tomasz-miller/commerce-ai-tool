import type { SearchLocaleContext } from "../types/index.js";

/** @deprecated Import from `../prompts/index.js` — re-exported for compatibility. */
export { TTS_SUMMARY_PROMPT } from "../prompts/index.js";

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
