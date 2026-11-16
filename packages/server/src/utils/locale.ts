import type { SearchLocaleOptions } from "@commerce-ai-tool/core";
import type { CommerceAIServer } from "../server.js";

/** Longest value worth canonicalizing; real BCP 47 tags are far shorter. */
const MAX_LOCALE_LENGTH = 64;

export interface SearchLocaleRequestFields {
  queryLocale?: string;
  catalogLocale?: string;
  /** @deprecated Use queryLocale */
  locale?: string;
}

export interface LocalePolicy {
  /** Catalog locales clients may use. Unset or empty: any well-formed locale. Never applies to `queryLocale`. */
  allowed?: readonly string[];
  defaults: { catalogLocale: string };
}

/** Canonical BCP 47 form (`Intl.getCanonicalLocales`) of a locale string, or undefined when it is not well formed. */
function canonicalizeLocale(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LOCALE_LENGTH) {
    return undefined;
  }
  try {
    return Intl.getCanonicalLocales(trimmed)[0];
  } catch {
    return undefined;
  }
}

/**
 * Canonicalises `CAT_SUPPORTED_LOCALES` / `config.supportedLocales` once at startup. Invalid entries
 * are dropped with one `console.warn` each (config values, not user data); duplicates are removed.
 * Returns undefined for an unset or empty list ("any well-formed locale"). A non-empty list in which
 * no entry survives throws instead: the allowlist is an opt-in restriction, and a typo must not
 * silently remove it.
 */
export function canonicalizeSupportedLocales(
  entries: readonly string[] | undefined,
): string[] | undefined {
  if (!entries?.length) {
    return undefined;
  }
  const result: string[] = [];
  const invalid: string[] = [];
  for (const entry of entries) {
    const canonical = canonicalizeLocale(entry);
    if (!canonical) {
      invalid.push(entry);
    } else if (!result.includes(canonical)) {
      result.push(canonical);
    }
  }
  if (!result.length) {
    throw new Error(
      `Invalid CAT_SUPPORTED_LOCALES: no valid locale in ${invalid.map((entry) => JSON.stringify(entry)).join(", ")}; expected canonical BCP 47 tags such as "en-GB"`,
    );
  }
  for (const entry of invalid) {
    console.warn(
      `[commerce-ai-tool/server] Ignoring invalid supported locale ${JSON.stringify(entry)}: expected a canonical BCP 47 tag such as "en-GB"`,
    );
  }
  return result;
}

/**
 * Validates a client-supplied locale. The value must be a canonical BCP 47 tag
 * (`Intl.getCanonicalLocales`) and, when an allowlist is given, match one of its
 * entries case-insensitively. Returns the allowlist's spelling on a match and `fallback`
 * for anything else. Pass `undefined` as the allowlist for the shopper's `queryLocale`.
 */
export function normalizeLocale(
  value: unknown,
  allowed: readonly string[] | undefined,
  fallback: string,
): string {
  const canonical = canonicalizeLocale(value);
  if (!canonical) {
    return fallback;
  }

  if (!allowed?.length) {
    return canonical;
  }
  const wanted = canonical.toLowerCase();
  return allowed.find((entry) => entry.trim().toLowerCase() === wanted)?.trim() ?? fallback;
}

export function localePolicy(
  server: Pick<CommerceAIServer, "cartDefaults" | "supportedLocales">,
): LocalePolicy {
  const catalogLocale = server.cartDefaults.catalogLocale;
  return {
    allowed: server.supportedLocales,
    defaults: { catalogLocale },
  };
}

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export function parseSearchLocaleOptions(
  fields: SearchLocaleRequestFields,
  policy: LocalePolicy,
): SearchLocaleOptions {
  const { allowed, defaults } = policy;
  const catalogLocale = normalizeLocale(fields.catalogLocale, allowed, defaults.catalogLocale);
  const requestedQuery = fields.queryLocale ?? fields.locale;
  // queryLocale is the shopper's own language: canonical-form check only, never the catalog allowlist.
  const queryLocale = isAbsent(requestedQuery)
    ? catalogLocale
    : normalizeLocale(requestedQuery, undefined, catalogLocale);

  return { queryLocale, catalogLocale };
}
