import type {
  InterpretedSearchQuery,
  ProductSearchQueryBody,
  SearchLocaleContext,
  VoiceAudioInterpretation,
} from "../types/index.js";

export const TEXT_QUERY_SYSTEM_PROMPT = `You are a product search assistant for a commercetools storefront.
Given a natural language query, extract search terms and optional filters.
The user may search in any language (including speech-to-text in a different language than the stated query locale).
searchTerms must ALWAYS be in the product catalog language only — translate product keywords from the query into that language.
Never put the user's query language into searchTerms when it differs from the catalog language.
Write interpretation in the user's query language when known; otherwise use the catalog language.
Respond with valid JSON only, matching this schema:
{
  "searchTerms": ["string"],
  "filters": { "optionalKey": "optionalValue" },
  "sort": "relevance" | "price_asc" | "price_desc",
  "interpretation": "brief explanation of how you interpreted the query"
}
Use searchTerms for product names, brands, categories, or attributes.
Keep searchTerms concise and commerce-focused.
Examples when catalog language is Norwegian (no):
- query "red shoes" → searchTerms: ["røde sko"]
- query "nóż do tapet" → searchTerms: ["tapetkniv"]
- query "wallpaper knife" → searchTerms: ["tapetkniv"]`;

export const IMAGE_QUERY_SYSTEM_PROMPT = `You are a product search assistant for a commercetools storefront.
Analyze the product image and extract searchable attributes.
Return searchTerms in the product catalog language only so commercetools full-text search matches indexed product names.
Never use a language other than the catalog language in searchTerms.
Write interpretation in the user's query language when provided.
Respond with valid JSON only, matching this schema:
{
  "searchTerms": ["string"],
  "filters": { "optionalKey": "optionalValue" },
  "sort": "relevance" | "price_asc" | "price_desc",
  "interpretation": "brief description of the product visible in the image"
}
Focus on product type, color, brand, style, and distinguishing features.
Prefer one short primary search phrase when possible.`;

export const VOICE_ENHANCE_SYSTEM_PROMPT = `You are a voice search query enhancer for an e-commerce storefront.
Given a speech-to-text transcript, return a clean, concise product search query in the same language as the transcript.
Remove filler words and fix obvious transcription errors.
Respond with the enhanced query text only, no JSON or quotes.`;

export const VOICE_AUDIO_INTERPRET_SYSTEM_PROMPT = `You are a voice product search assistant for a commercetools storefront.
Listen to the user's audio recording and:
1. Transcribe what they said (verbatim, including the spoken language).
2. Produce an enhancedQuery: a clean product search phrase with filler words removed and obvious speech errors fixed (same language as the transcript).
3. Extract searchTerms for commercetools full-text search in the product catalog language only.
The user may speak in any language (speech may differ from the stated query locale).
searchTerms must ALWAYS be in the product catalog language only — translate product keywords from the speech into that language.
Never put the user's spoken language into searchTerms when it differs from the catalog language.
Write interpretation in the user's query language when known; otherwise use the catalog language.
Respond with valid JSON only, matching this schema:
{
  "transcript": "verbatim transcription of the audio",
  "enhancedQuery": "cleaned search phrase in the transcript language",
  "searchTerms": ["string"],
  "filters": { "optionalKey": "optionalValue" },
  "sort": "relevance" | "price_asc" | "price_desc",
  "interpretation": "brief explanation of how you interpreted the query"
}
Use searchTerms for product names, brands, categories, or attributes.
Keep searchTerms concise and commerce-focused.
Examples when catalog language is Norwegian (no):
- speech "red shoes" → searchTerms: ["røde sko"]
- speech "nóż do tapet" → searchTerms: ["tapetkniv"]
- speech "wallpaper knife" → searchTerms: ["tapetkniv"]`;

export function formatLocaleContext(locales: SearchLocaleContext): string {
  return [
    `User query language: ${locales.queryLocale}`,
    `Product catalog language: ${locales.catalogLocale}`,
    `CRITICAL: searchTerms must use only the catalog language (${locales.catalogLocale}).`,
    "Translate product keywords from the query into the catalog language.",
    "The query text may be in another language (e.g. speech recognition).",
  ].join("\n");
}

export function buildTextQueryUserMessage(text: string, locales: SearchLocaleContext): string {
  return `${formatLocaleContext(locales)}\nQuery: ${text}`;
}

export function buildImageQueryUserMessage(locales: SearchLocaleContext): string {
  return `${formatLocaleContext(locales)}\nAnalyze this product image.`;
}

export function buildVoiceEnhanceUserMessage(transcript: string, locales: SearchLocaleContext): string {
  return `${formatLocaleContext(locales)}\nTranscript: ${transcript}`;
}

export function buildVoiceAudioUserMessage(locales: SearchLocaleContext): string {
  return `${formatLocaleContext(locales)}\nListen to this voice search recording and extract search terms.`;
}

export function buildProductSearchBody(
  interpreted: InterpretedSearchQuery,
  catalogLocale: string,
  limit = 20,
  offset = 0,
): ProductSearchQueryBody {
  const terms = interpreted.searchTerms.filter(Boolean);
  const primaryTerm = terms.join(" ");

  const body: ProductSearchQueryBody = {
    limit,
    offset,
  };

  if (primaryTerm) {
    if (terms.length === 1) {
      body.query = {
        fullText: {
          field: "name",
          language: catalogLocale,
          value: primaryTerm,
        },
      };
    } else {
      body.query = {
        or: terms.map((term) => ({
          fullText: {
            field: "name",
            language: catalogLocale,
            value: term,
          },
        })),
      };
    }
  }

  if (interpreted.sort === "price_asc") {
    body.sort = [{ field: "variants.prices.centAmount", order: "asc" }];
  } else if (interpreted.sort === "price_desc") {
    body.sort = [{ field: "variants.prices.centAmount", order: "desc" }];
  }

  return body;
}

export function parseInterpretedQuery(json: string): InterpretedSearchQuery {
  const parsed = JSON.parse(json) as Partial<InterpretedSearchQuery>;

  if (!parsed.searchTerms || !Array.isArray(parsed.searchTerms)) {
    throw new Error("Invalid AI response: missing searchTerms array");
  }

  return {
    searchTerms: parsed.searchTerms.map(String).filter(Boolean),
    filters: parsed.filters,
    sort: parsed.sort ?? "relevance",
    interpretation: parsed.interpretation ?? parsed.searchTerms.join(" "),
  };
}

export function parseVoiceAudioInterpretation(json: string): VoiceAudioInterpretation {
  const parsed = JSON.parse(json) as Partial<VoiceAudioInterpretation>;

  if (!parsed.transcript || typeof parsed.transcript !== "string") {
    throw new Error("Invalid AI response: missing transcript string");
  }

  if (!parsed.enhancedQuery || typeof parsed.enhancedQuery !== "string") {
    throw new Error("Invalid AI response: missing enhancedQuery string");
  }

  const interpreted = parseInterpretedQuery(json);

  return {
    transcript: parsed.transcript.trim(),
    enhancedQuery: parsed.enhancedQuery.trim(),
    ...interpreted,
  };
}
