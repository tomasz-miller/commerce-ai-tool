/**
 * Browser-safe core surface for the React and Angular widgets.
 * Do not re-export AI, commercetools, or observability from this entry.
 */
export type * from "./types/index.js";
export {
  ANONYMOUS_ID_HEADER,
  CART_SESSION_HEADER,
  MAX_LINE_ITEM_QUANTITY,
  ORDER_NUMBER_PATTERN,
} from "./config/defaults.js";
/**
 * Type-only, as before the constants moved out of `types/` (`export type *` never carried the
 * runtime value); kept so `typeof SUGGESTIONS_MAX_LIMIT` still resolves for hosts.
 */
export type {
  SUGGESTIONS_DEFAULT_LIMIT,
  SUGGESTIONS_MAX_LIMIT,
  SUGGESTIONS_MIN_PREFIX_LENGTH,
} from "./config/defaults.js";
export { createRandomUuid } from "./utils/random-uuid.js";
export {
  DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
  formatNamedMessage,
  resolveCommerceAISearchMessages,
} from "./messages/index.js";
export type {
  CommerceAISearchMessages,
  ResolvedCommerceAISearchMessages,
} from "./messages/index.js";
export { looksLikeCompoundShoppingList, looksLikeShoppingList } from "./search/compound-shopping-list.js";
export {
  isFacetFilterSelected,
  toggleFacetFilter,
} from "./commercetools/facets.js";
export {
  hexColorSwatchValue,
  isColorLikeFacetName,
} from "./commercetools/facet-color.js";
export {
  CommerceAIApiError,
  createCommerceAIApiClient,
  type CommerceAIApiClient,
  type CommerceAIApiClientOptions,
  type CommerceAIRequestOptions,
} from "./browser/api-client.js";
export {
  ANONYMOUS_ID_STORAGE_KEY,
  CUSTOMER_SESSION_STORAGE_KEY,
  CUSTOMER_STORAGE_KEY,
  createCartSessionStore,
  getSharedCartSessionStore,
  isStaleCartSnapshot,
  type CartSessionStore,
  type CartSyncMember,
  type StoredCartSession,
} from "./browser/cart-session-store.js";
export { selectedFacetChips, trackChipGroups } from "./browser/facet-chips.js";
export { safeStorage, type StorageLike } from "./browser/storage.js";
export {
  buildCameraConstraints,
  createJpegFileFromVideo,
  getCameraErrorMessage,
  prefersNativeCamera,
  stopMediaStream,
  type CameraFacingMode,
} from "./browser/camera.js";
export { focusFirstAvailable, getFocusable } from "./browser/focus.js";
export {
  formatResultsCount,
  searchAnnouncement,
  type SearchAnnouncementState,
} from "./browser/announcement.js";
export { addToCartLabel, quantityGroupLabel, removeItemLabel } from "./browser/labels.js";
export {
  formatMissionAddAll,
  lineItemKey,
  starterBundleItems,
  toCartItem,
} from "./browser/mission-cart.js";
export { audioFromBase64, createAudioPlayer, recordedAudioFile, type AudioPlayer } from "./browser/audio.js";
export { messageForError, type MessageForErrorOptions } from "./browser/error-messages.js";
