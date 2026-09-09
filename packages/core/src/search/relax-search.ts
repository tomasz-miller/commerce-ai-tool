import type {
  InterpretedSearchFilters,
  InterpretedSearchQuery,
  SearchRelaxationLevel,
} from "../types/index.js";

const HARD_FILTER_KEYS = new Set(["category", "priceMin", "priceMax"]);

export function hasSoftFilters(filters?: InterpretedSearchFilters): boolean {
  if (!filters) {
    return false;
  }
  return Object.entries(filters).some(([key, value]) => Boolean(value) && !HARD_FILTER_KEYS.has(key));
}

export function dropSoftFilters(filters?: InterpretedSearchFilters): InterpretedSearchFilters | undefined {
  if (!filters) {
    return undefined;
  }

  const kept: InterpretedSearchFilters = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value && HARD_FILTER_KEYS.has(key)) {
      kept[key] = value;
    }
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

function resolvePrimaryPhrase(interpreted: InterpretedSearchQuery): string | undefined {
  const primary = interpreted.primaryTerm?.trim().replace(/\s+/g, " ");
  if (primary) {
    return primary;
  }
  const first = interpreted.searchTerms[0]?.trim().replace(/\s+/g, " ");
  return first || undefined;
}

/**
 * Next interpreted query for a zero-result retry, or `null` when this level cannot help.
 */
export function relaxInterpretedSearch(
  interpreted: InterpretedSearchQuery,
  level: Exclude<SearchRelaxationLevel, "none">,
): InterpretedSearchQuery | null {
  if (level === "drop_soft_filters") {
    if (!hasSoftFilters(interpreted.filters)) {
      return null;
    }
    return {
      ...interpreted,
      filters: dropSoftFilters(interpreted.filters),
    };
  }

  const primary = resolvePrimaryPhrase(interpreted);
  if (!primary) {
    return null;
  }

  return {
    ...interpreted,
    primaryTerm: primary,
    searchTerms: [primary],
    filters: dropSoftFilters(interpreted.filters),
  };
}
