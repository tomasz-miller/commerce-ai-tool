import type { SearchLocaleOptions } from "@commerce-ai-tool/core";

export interface SearchLocaleRequestFields {
  queryLocale?: string;
  catalogLocale?: string;
  /** @deprecated Use queryLocale */
  locale?: string;
}

export function parseSearchLocaleOptions(
  fields: SearchLocaleRequestFields,
): SearchLocaleOptions {
  return {
    queryLocale: fields.queryLocale ?? fields.locale,
    catalogLocale: fields.catalogLocale,
    locale: fields.locale,
  };
}
