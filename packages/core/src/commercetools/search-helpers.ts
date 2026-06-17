import type { ProductSearchQueryBody } from "../types/index.js";

export interface ExtractedSearchTerms {
  terms: string[];
  locale: string;
}

export function extractSearchTerms(body: ProductSearchQueryBody): ExtractedSearchTerms {
  if (body.query?.fullText) {
    return {
      terms: [body.query.fullText.value],
      locale: body.query.fullText.language,
    };
  }

  if (body.query?.or) {
    const terms = body.query.or
      .map((clause) => clause.fullText?.value)
      .filter((term): term is string => Boolean(term));
    const locale = body.query.or[0]?.fullText?.language ?? "en";

    return { terms, locale };
  }

  return { terms: [], locale: "en" };
}

export function buildProjectionSearchQueryArgs(
  body: ProductSearchQueryBody,
  currency?: string,
): Record<string, string | number | boolean | string[]> {
  const { terms, locale } = extractSearchTerms(body);
  const textKey = `text.${locale}`;

  const queryArgs: Record<string, string | number | boolean | string[]> = {
    limit: body.limit ?? 20,
    offset: body.offset ?? 0,
    localeProjection: locale,
    fuzzy: true,
  };

  if (terms.length > 0) {
    queryArgs[textKey] = terms.length === 1 ? terms[0]! : terms;
  }

  if (currency) {
    queryArgs.priceCurrency = currency;
  }

  const sort = body.sort?.[0];
  if (sort?.field === "variants.prices.centAmount") {
    queryArgs.sort = sort.order === "asc" ? "price asc" : "price desc";
  }

  return queryArgs;
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
