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
    terms: uniquePhrases.length > 0 ? [uniquePhrases[0]!] : [],
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

export function isProductSearchUnavailable(error: unknown): boolean {
  const message = getErrorMessage(error);

  return (
    message.includes("URI not found") ||
    message.includes("ObjectNotFound") ||
    message.includes("Product Search API is not enabled")
  );
}

export function productSearchUnavailableMessage(projectKey: string): string {
  return (
    `Product Search API is not enabled for project "${projectKey}". ` +
    "Enable it in Merchant Center (Settings → Project settings → Storefront Search) " +
    "or the client will fall back to Product Projection Search automatically."
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "body" in error) {
    const body = (error as { body?: { message?: string } }).body;
    if (body?.message) {
      return body.message;
    }
  }

  return String(error);
}
