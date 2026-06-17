import type { CommerceAIDefaults } from "../types/index.js";

export interface SearchLocaleRequest {
  /** @deprecated Use queryLocale */
  locale?: string;
  queryLocale?: string;
  catalogLocale?: string;
}

export interface ResolvedSearchLocales {
  catalogLocale: string;
  queryLocale: string;
}

export function resolveSearchLocales(options: {
  defaults?: CommerceAIDefaults;
  request?: SearchLocaleRequest;
}): ResolvedSearchLocales {
  const { defaults, request = {} } = options;

  const catalogLocale =
    request.catalogLocale ?? defaults?.catalogLocale ?? defaults?.locale ?? "en";

  const queryLocale = request.queryLocale ?? request.locale ?? catalogLocale;

  return { catalogLocale, queryLocale };
}
