---
"@commerce-ai-tool/core": minor
"@commerce-ai-tool/react": minor
"@commerce-ai-tool/angular": minor
---

Screen readers now hear what the widgets do. Each search widget has one always-mounted, visually hidden `role="status"` live region (class `cat-visually-hidden`) that announces `listening`, `understandingQuery`, `preparingAudioSummary`, `searching`, the result count (the `resultsCount` message, `{count}` is the number of products), `noProductsFound` and `noSuggestions`. Search errors and voice errors render with `role="alert"`; the voice banner is no longer a live region itself and its recording timer is `role="timer"`, so it no longer announces every second. The visible empty-state block is no longer a live region (the shared one announces it, once).

The autocomplete follows the ARIA combobox pattern: the listbox is a `<ul role="listbox">` whose only children are `<li role="option">` (they replace the `<button role="option">` elements and are not in the Tab order; arrow keys, Enter and Escape work as before), and the loading, error and "No suggestions" rows sit next to the listbox in the `.cat-suggestions` panel. The listbox exists only while there are options, so `aria-expanded` is true and `aria-controls` is set only then; `aria-expanded`, `aria-controls` and `aria-activedescendant` are no longer set when `enableAutocomplete` is off. React derives the listbox, option and checkout hint ids from `useId()` (two widgets on one page no longer share ids). Host CSS that targeted `button.cat-suggestions__item` or relied on `.cat-suggestions` being the listbox element should target `.cat-suggestions__item` and `.cat-suggestions__list`. Core exports `searchAnnouncement` and `formatResultsCount` for both widgets.
