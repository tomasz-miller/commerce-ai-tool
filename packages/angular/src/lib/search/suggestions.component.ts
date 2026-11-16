import { ChangeDetectionStrategy, Component, ViewEncapsulation, input, output } from "@angular/core";
import type { ResolvedCommerceAISearchMessages } from "@commerce-ai-tool/core/client";
import { suggestionOptionId } from "./search.model";

/**
 * The autocomplete panel: the loading, error and empty status rows, then a `<ul role="listbox">`
 * whose only children are `<li role="option">`. The listbox exists only while there are options.
 * Its id (unique per widget instance) is what the search input's `aria-controls` points at and
 * the option ids are what `aria-activedescendant` points at; options stay out of the Tab order.
 */
@Component({
  selector: "div[commerce-ai-suggestions]",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: "./suggestions.component.html",
  host: {
    class: "cat-suggestions",
  },
})
export class CommerceAiSuggestionsComponent {
  readonly messages = input.required<ResolvedCommerceAISearchMessages>();
  readonly listboxId = input.required<string>();
  readonly suggestions = input<readonly string[]>([]);
  readonly activeIndex = input(-1);
  readonly isLoading = input(false);
  readonly error = input<string | null>(null);
  /** True once a request for the current query has finished (so "no suggestions" may show). */
  readonly ready = input(false);

  readonly suggestionSelect = output<string>();

  protected optionId(index: number): string {
    return suggestionOptionId(this.listboxId(), index);
  }
}
