const COMPOUND_SHOPPING_LIST_PATTERN = /\band\b|,|\bplus\b|\boraz\b/i;

/**
 * Heuristic for the search box: a new multi-item query should not be treated as
 * a facet NL refine of the previous session.
 */
export function looksLikeCompoundShoppingList(query: string): boolean {
  return COMPOUND_SHOPPING_LIST_PATTERN.test(query.trim());
}
