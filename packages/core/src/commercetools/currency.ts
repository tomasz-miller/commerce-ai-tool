/**
 * Keyed by the upper-cased code. Only codes `Intl` accepts are stored, and `Intl` accepts any
 * well-formed three-letter code, so the set is not closed: the cache stops growing at
 * `MAX_CACHED_CURRENCIES` (in practice it holds the project's few currencies). Rejected codes
 * are not cached.
 */
const fractionDigitsByCurrency = new Map<string, number>();
const MAX_CACHED_CURRENCIES = 256;

/**
 * Number of minor-unit digits of a currency (2 for EUR, 0 for JPY, 3 for KWD), from the
 * runtime's ISO 4217 data. Falls back to 2 when the currency is missing or not a valid code.
 * The result is cached per currency code: `Intl.NumberFormat` construction is not cheap and
 * this runs for every price filter, facet and chip.
 */
export function currencyFractionDigits(currency?: string): number {
  if (!currency) {
    return 2;
  }
  const key = currency.toUpperCase();
  const cached = fractionDigitsByCurrency.get(key);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const digits =
      new Intl.NumberFormat("en", { style: "currency", currency: key }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    if (fractionDigitsByCurrency.size < MAX_CACHED_CURRENCIES) {
      fractionDigitsByCurrency.set(key, digits);
    }
    return digits;
  } catch {
    return 2;
  }
}
