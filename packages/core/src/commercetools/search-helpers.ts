import type { ProductSearchRequest } from "@commercetools/platform-sdk";

export interface ExtractedSearchTerms {
  terms: string[];
  locale: string;
}

export function extractSearchTerms(body: ProductSearchRequest): ExtractedSearchTerms {
  const terms: string[] = [];
  let locale = "en";

  walkQueryNode(body.query, terms, (foundLocale) => {
    locale = foundLocale;
  });

  const uniquePhrases = [...new Set(terms.map((term) => term.trim()).filter(Boolean))];

  return {
    terms: uniquePhrases,
    locale,
  };
}

function walkQueryNode(
  node: unknown,
  terms: string[],
  setLocale: (locale: string) => void,
): void {
  if (!node || typeof node !== "object") {
    return;
  }

  const obj = node as Record<string, unknown>;

  for (const key of ["fullText", "fuzzy"] as const) {
    const expression = obj[key];
    if (!expression || typeof expression !== "object") {
      continue;
    }

    const typed = expression as { value?: string; language?: string };
    if (typed.value) {
      terms.push(typed.value);
    }
    if (typed.language) {
      setLocale(typed.language);
    }
  }

  for (const key of ["or", "and"] as const) {
    const children = obj[key];
    if (!Array.isArray(children)) {
      continue;
    }

    for (const child of children) {
      walkQueryNode(child, terms, setLocale);
    }
  }
}

export { buildProjectionSearchQueryArgs } from "./query-builder.js";

export function extractProductSearchIds(
  results: Array<{ id?: string; productProjection?: { id?: string } }>,
): string[] {
  return results
    .map((result) => result.id ?? result.productProjection?.id)
    .filter((id): id is string => Boolean(id));
}

/**
 * Product id -> sku of the first matching variant, for results where only some variants matched
 * (`markMatchingVariants: true`). Products where every variant matched, or whose first matched
 * variant has no sku, are left out: their card uses the master variant.
 */
export function extractMatchedSkus(
  results: Array<{
    id?: string;
    matchingVariants?: { allMatched: boolean; matchedVariants: Array<{ id: number; sku?: string }> };
  }>,
): Record<string, string> {
  const matched: Record<string, string> = {};
  for (const result of results) {
    const variants = result.matchingVariants;
    if (!result.id || !variants || variants.allMatched) {
      continue;
    }
    const sku = variants.matchedVariants[0]?.sku;
    if (sku) {
      matched[result.id] = sku;
    }
  }
  return matched;
}

/**
 * Product Search is not activated on the commercetools project and the deprecated Product
 * Projection Search fallback is off. The message names the project and how to enable the API: it
 * is for the operator's log, not for shoppers (the server answers 503 `UPSTREAM_UNAVAILABLE`).
 */
export class ProductSearchUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProductSearchUnavailableError";
  }
}

export function isProductSearchUnavailable(error: unknown): boolean {
  const message = getErrorMessage(error);

  return (
    message.includes("URI not found") ||
    message.includes("ObjectNotFound") ||
    message.includes("Product Search API is not enabled")
  );
}

export function productSearchUnavailableMessage(
  projectKey: string,
  options: { legacyFallback?: boolean } = {},
): string {
  const enable =
    `Product Search API is not enabled for project "${projectKey}". ` +
    "Enable it in Merchant Center (Settings → Project settings → Storefront Search)";
  return options.legacyFallback
    ? `${enable} or the client will fall back to the deprecated Product Projection Search automatically.`
    : `${enable}. The deprecated Product Projection Search fallback is off: set ` +
        "CAT_LEGACY_PRODUCT_PROJECTION_SEARCH=true (config.commercetools.legacyProductProjectionSearch) to allow it.";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    // ts-client rejects with the HttpError itself, or `{ body: null, error: HttpError }` for a
    // network failure; the payload is `error` (`body` is its deprecated alias).
    const candidate = error as { error?: unknown; body?: unknown };
    const payload = candidate.error ?? candidate.body;
    if (typeof payload === "object" && payload !== null) {
      const message = (payload as { message?: unknown }).message;
      if (typeof message === "string" && message) {
        return message;
      }
    }
  }

  return String(error);
}
