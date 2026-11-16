import { isFacetFilterSelected } from "../commercetools/facets.js";
import type { InterpretedSearchFilters, SearchFacetGroup } from "../types/index.js";

/** Selected bucket keys of one facet group under `filters`. */
function selectedBucketKeys(group: SearchFacetGroup, filters: InterpretedSearchFilters): string[] {
  return group.buckets
    .filter((bucket) => isFacetFilterSelected(filters, group.id, bucket.key, group.currency))
    .map((bucket) => bucket.key);
}

/**
 * The chip groups after the shopper moved from `previous` to `next` filters: a group whose
 * selection changed and is now non-empty is a chip the shopper clicked; a group that is no longer
 * selected is dropped. Filters the model echoed back in `appliedFilters` are not chips until the
 * shopper touches their group.
 */
export function trackChipGroups(
  tracked: ReadonlySet<string>,
  facets: SearchFacetGroup[],
  previous: InterpretedSearchFilters,
  next: InterpretedSearchFilters,
): Set<string> {
  const groups = new Set(tracked);
  for (const group of facets) {
    const after = selectedBucketKeys(group, next);
    if (after.length === 0) {
      groups.delete(group.id);
      continue;
    }
    const before = selectedBucketKeys(group, previous);
    if (before.length !== after.length || before.some((key, index) => key !== after[index])) {
      groups.add(group.id);
    }
  }
  return groups;
}

/**
 * The `facetSelections` wire field: every tracked chip group that is still selected under
 * `filters` (`categories` included) mapped to its selected bucket keys. `undefined` when there
 * is none, so the field is omitted and the server keeps its categories-only behaviour.
 */
export function selectedFacetChips(
  facets: SearchFacetGroup[],
  filters: InterpretedSearchFilters,
  chipGroups: ReadonlySet<string>,
): Record<string, string[]> | undefined {
  const selections: Record<string, string[]> = {};
  for (const group of facets) {
    if (!chipGroups.has(group.id)) {
      continue;
    }
    const keys = selectedBucketKeys(group, filters);
    if (keys.length > 0) {
      selections[group.id] = keys;
    }
  }
  return Object.keys(selections).length > 0 ? selections : undefined;
}
