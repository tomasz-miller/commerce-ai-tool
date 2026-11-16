import type { ResolvedCommerceAISearchMessages } from "../messages/index.js";

/** `{count}` is replaced with the number of results; a template without it gets the count appended. */
export function formatResultsCount(template: string, count: number): string {
  if (template.includes("{count}")) {
    return template.replaceAll("{count}", String(count));
  }
  return `${template} (${count})`;
}

/** What the widget shows right now, reduced to what a screen reader needs to hear. */
export interface SearchAnnouncementState {
  isRecording: boolean;
  isProcessing: boolean;
  isLoadingTts: boolean;
  /** A search request is in flight (text, image or voice). */
  isLoading: boolean;
  /** A search error is showing; it is announced by its own `role="alert"`, not here. */
  hasError: boolean;
  /** Number of products on screen, or null while no results are shown. */
  resultCount: number | null;
  showEmptyResults: boolean;
  /** The autocomplete panel is open with no suggestions to offer. */
  noSuggestions: boolean;
  /** Mission lanes whose search failed (their lane shows `missionIntentFailed`). */
  missionFailedLanes?: number;
  /** Mission lanes that returned no products without failing (`missionIntentEmpty`). */
  missionEmptyLanes?: number;
}

/**
 * The text for the widget's always-mounted polite live region. One state wins at a time so
 * consecutive changes (Listening, Understanding, Searching, Results: 5) replace each other
 * instead of queuing. Errors are left out on purpose: they render with `role="alert"`. Mission lane
 * failures and empty lanes are appended to the count, since their lane markup is not a live region.
 */
export function searchAnnouncement(
  messages: Pick<
    ResolvedCommerceAISearchMessages,
    | "listening"
    | "understandingQuery"
    | "preparingAudioSummary"
    | "searching"
    | "resultsCount"
    | "noProductsFound"
    | "noSuggestions"
  > &
    Partial<Pick<ResolvedCommerceAISearchMessages, "missionIntentFailed" | "missionIntentEmpty">>,
  state: SearchAnnouncementState,
): string {
  if (state.isRecording) return messages.listening;
  if (state.isProcessing) return messages.understandingQuery;
  if (state.isLoadingTts) return messages.preparingAudioSummary;
  if (state.isLoading) return messages.searching;
  if (state.hasError) return "";
  if (state.showEmptyResults) return messages.noProductsFound;
  if (state.resultCount !== null) {
    // Lane states have no live region of their own, so they ride along with the count.
    const notices = [
      (state.missionFailedLanes ?? 0) > 0 ? messages.missionIntentFailed : undefined,
      (state.missionEmptyLanes ?? 0) > 0 ? messages.missionIntentEmpty : undefined,
    ].filter((notice): notice is string => Boolean(notice));
    // Join as sentences, without doubling the punctuation of a host message that already ends one.
    return [formatResultsCount(messages.resultsCount, state.resultCount), ...notices].reduce(
      (text, part) => (/[.!?…]$/.test(text.trimEnd()) ? `${text.trimEnd()} ${part}` : `${text}. ${part}`),
    );
  }
  if (state.noSuggestions) return messages.noSuggestions;
  return "";
}
