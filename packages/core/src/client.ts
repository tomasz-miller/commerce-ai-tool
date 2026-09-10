/**
 * Browser-safe core surface for the React and Angular widgets.
 * Do not re-export AI, commercetools, or observability from this entry.
 */
export type * from "./types/index.js";
export { CART_SESSION_HEADER, MAX_LINE_ITEM_QUANTITY } from "./types/index.js";
export {
  DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
  resolveCommerceAISearchMessages,
} from "./messages/index.js";
export type { CommerceAISearchMessages } from "./messages/index.js";
export { looksLikeCompoundShoppingList } from "./search/compound-shopping-list.js";
export {
  isFacetFilterSelected,
  toggleFacetFilter,
} from "./commercetools/facets.js";
export {
  hexColorSwatchValue,
  isColorLikeFacetName,
} from "./commercetools/facet-color.js";
