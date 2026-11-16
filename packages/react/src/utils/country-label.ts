type DisplayNamesType = "region";

/** Enough for the locales a page realistically switches between; oldest entry goes first. */
const MAX_CACHED_DISPLAY_NAMES = 8;

const displayNamesCache = new Map<string, Intl.DisplayNames | null>();

function createDisplayNames(locale: string, type: DisplayNamesType): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([locale, "en"], { type });
  } catch {
    try {
      return new Intl.DisplayNames(["en"], { type });
    } catch {
      return null;
    }
  }
}

function getDisplayNames(locale: string, type: DisplayNamesType): Intl.DisplayNames | null {
  const key = `${locale}\u0000${type}`;
  if (displayNamesCache.has(key)) {
    return displayNamesCache.get(key) ?? null;
  }
  const displayNames = createDisplayNames(locale, type);
  if (displayNamesCache.size >= MAX_CACHED_DISPLAY_NAMES) {
    const oldest = displayNamesCache.keys().next();
    if (!oldest.done) displayNamesCache.delete(oldest.value);
  }
  displayNamesCache.set(key, displayNames);
  return displayNames;
}

/** Localised country name for an ISO 3166-1 alpha-2 code; falls back to English, then to the code. */
export function countryLabel(code: string, locale = "en"): string {
  try {
    return getDisplayNames(locale, "region")?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Test hook: drop the module-level cache. */
export function resetCountryLabelCache(): void {
  displayNamesCache.clear();
}
