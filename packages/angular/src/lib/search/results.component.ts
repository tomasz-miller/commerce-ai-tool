import { ChangeDetectionStrategy, Component, ViewEncapsulation, input, output } from "@angular/core";
import type { ProductCard, ResolvedCommerceAISearchMessages } from "@commerce-ai-tool/core/client";
import { addToCartLabel } from "./search.model";

/**
 * The product grid (and its empty state) of a text, image or voice search. It is the host
 * element of the results list, so `.cat-results` keeps its layout. Presentational: products and
 * the "just added" state come in through inputs, selecting and adding leave through outputs.
 */
@Component({
  selector: "div[commerce-ai-results]",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: "./results.component.html",
  host: {
    class: "cat-results",
    "[attr.role]": "results().length > 0 ? 'list' : null",
    "[attr.aria-label]": "results().length > 0 ? messages().searchResultsAriaLabel : null",
  },
})
export class CommerceAiResultsComponent {
  readonly messages = input.required<ResolvedCommerceAISearchMessages>();
  readonly results = input<readonly ProductCard[]>([]);
  readonly enableCart = input(false);
  readonly isMutating = input(false);
  readonly addedProductIds = input<Readonly<Record<string, true>>>({});
  /** Shows the empty state when there are no results: a search for `query` has finished. */
  readonly hasSearched = input(false);
  readonly query = input("");
  readonly queryInterpretation = input<string | undefined>(undefined);

  readonly productSelect = output<ProductCard>();
  readonly addItem = output<ProductCard>();

  protected addLabel(product: ProductCard): string {
    return addToCartLabel(this.messages(), this.addedProductIds(), product);
  }
}
