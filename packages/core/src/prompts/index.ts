import type { InterpretedSearchQuery, ProductSearchQueryBody } from "../types/index.js";

export const TEXT_QUERY_SYSTEM_PROMPT = `You are a product search assistant for a commercetools storefront.
Given a natural language query, extract search terms and optional filters.
Respond with valid JSON only, matching this schema:
{
  "searchTerms": ["string"],
  "filters": { "optionalKey": "optionalValue" },
  "sort": "relevance" | "price_asc" | "price_desc",
  "interpretation": "brief explanation of how you interpreted the query"
}
Use searchTerms for product names, brands, categories, or attributes.
Keep searchTerms concise and commerce-focused.`;

export const IMAGE_QUERY_SYSTEM_PROMPT = `You are a product search assistant for a commercetools storefront.
Analyze the product image and extract searchable attributes.
Respond with valid JSON only, matching this schema:
{
  "searchTerms": ["string"],
  "filters": { "optionalKey": "optionalValue" },
  "sort": "relevance" | "price_asc" | "price_desc",
  "interpretation": "brief description of the product visible in the image"
}
Focus on product type, color, brand, style, and distinguishing features.`;

export const VOICE_ENHANCE_SYSTEM_PROMPT = `You are a voice search query enhancer for an e-commerce storefront.
Given a speech-to-text transcript, return a clean, concise product search query.
Remove filler words and fix obvious transcription errors.
Respond with the enhanced query text only, no JSON or quotes.`;

export const TTS_SUMMARY_PROMPT = `Summarize these product search results in one short spoken sentence for a voice assistant.
Mention the number of results and highlight the top product name if available.`;

export function buildProductSearchBody(
  interpreted: InterpretedSearchQuery,
  locale: string,
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
          language: locale,
          value: primaryTerm,
        },
      };
    } else {
      body.query = {
        or: terms.map((term) => ({
          fullText: {
            field: "name",
            language: locale,
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
