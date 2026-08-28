import type {
  CommerceAISearchMessages,
  InterpretedSearchFilters,
  SearchFacetGroup,
  SuggestedFacet,
} from "@commerce-ai-tool/core";
import {
  hexColorSwatchValue,
  isColorLikeFacetName,
  isFacetFilterSelected,
  toggleFacetFilter,
} from "@commerce-ai-tool/core";

interface SearchFacetsProps {
  facets: SearchFacetGroup[];
  suggestedFacets: SuggestedFacet[];
  filters: InterpretedSearchFilters;
  messages: CommerceAISearchMessages;
  onChange: (filters: InterpretedSearchFilters) => void;
  onNewSearch?: () => void;
}

export function SearchFacets({
  facets,
  suggestedFacets,
  filters,
  messages,
  onChange,
  onNewSearch,
}: SearchFacetsProps) {
  const suggestedNames = new Set(suggestedFacets.map((facet) => facet.name));
  const visibleFacets = facets.filter((facet) => suggestedNames.size === 0 || suggestedNames.has(facet.id));
  if (!visibleFacets.length) return null;

  return (
    <section className="cat-facets" aria-label={messages.filtersAriaLabel}>
      <div className="cat-facets__header">
        <span>{messages.narrowResults}</span>
        <div className="cat-facets__actions">
          {Object.keys(filters).length > 0 && (
            <button type="button" className="cat-facets__clear" onClick={() => onChange({})}>
              {messages.clearFilters}
            </button>
          )}
          {onNewSearch && (
            <button type="button" className="cat-facets__new" onClick={onNewSearch}>
              {messages.newSearch}
            </button>
          )}
        </div>
      </div>
      {visibleFacets.map((facet) => (
        <div key={facet.id} className="cat-facet-group" role="group" aria-label={facet.label}>
          <span className="cat-facet-group__label">{facet.label}</span>
          <div className="cat-facet-group__options">
            {facet.buckets.map((bucket) => {
              const selected = isFacetFilterSelected(filters, facet.id, bucket.key);
              const swatch = isColorLikeFacetName(facet.id)
                ? hexColorSwatchValue(bucket.key)
                : undefined;
              return (
                <button
                  key={bucket.key}
                  type="button"
                  className={`cat-facet-chip ${selected ? "cat-facet-chip--selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => onChange(toggleFacetFilter(filters, facet.id, bucket.key))}
                >
                  {swatch ? (
                    <span
                      className="cat-facet-chip__swatch"
                      style={{ backgroundColor: swatch }}
                      aria-hidden="true"
                    />
                  ) : null}
                  {bucket.label}{" "}
                  <span className="cat-facet-chip__count" aria-hidden="true">
                    {bucket.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
