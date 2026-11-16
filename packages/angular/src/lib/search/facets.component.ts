import { ChangeDetectionStrategy, Component, ViewEncapsulation, input, output } from "@angular/core";
import {
  hexColorSwatchValue,
  isColorLikeFacetName,
  isFacetFilterSelected,
  type InterpretedSearchFilters,
  type ResolvedCommerceAISearchMessages,
  type SearchFacetGroup,
} from "@commerce-ai-tool/core/client";

export interface FacetToggle {
  facetId: string;
  key: string;
  currency?: string;
}

/**
 * The "narrow results" panel: one chip group per facet, plus the clear and new-search actions.
 * It is the host element of the `<section>` so the layout selectors on `.cat-facets` keep
 * matching. Presentational: the selected chips come from `appliedFilters`, every click leaves
 * through an output.
 */
@Component({
  selector: "section[commerce-ai-facets]",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: "./facets.component.html",
  host: {
    class: "cat-facets",
    "[attr.aria-label]": "messages().filtersAriaLabel",
  },
})
export class CommerceAiFacetsComponent {
  readonly messages = input.required<ResolvedCommerceAISearchMessages>();
  readonly facets = input<readonly SearchFacetGroup[]>([]);
  readonly appliedFilters = input<InterpretedSearchFilters | undefined>(undefined);
  readonly hasAppliedFilters = input(false);

  readonly toggle = output<FacetToggle>();
  readonly clear = output<void>();
  readonly newSearch = output<void>();

  protected isSelected(facetId: string, key: string, currency?: string): boolean {
    return isFacetFilterSelected(this.appliedFilters() ?? {}, facetId, key, currency);
  }

  protected swatch(facetId: string, key: string): string | undefined {
    return isColorLikeFacetName(facetId) ? hexColorSwatchValue(key) : undefined;
  }
}
