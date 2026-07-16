export interface CommerceAISearchMessages {
  placeholder: string;
  searchAriaLabel: string;
  productSearchAriaLabel: string;
  searchResultsAriaLabel: string;
  searching: string;
  noProductsFound: string;
  searchedFor: string;
  dropImageToSearch: string;
  voiceSearch: string;
  stopRecording: string;
  searchByCamera: string;
  searchByImage: string;
  replayVoiceSummary: string;
  listening: string;
  tapMicToStop: string;
  understandingQuery: string;
  preparingAudioSummary: string;
  cameraCapture: string;
  cameraPreview: string;
  capturePhoto: string;
  cancel: string;
  dismiss: string;
  searchFailed: string;
  imageSearchFailed: string;
  couldNotCapturePhoto: string;
  suggestionsAriaLabel: string;
  loadingSuggestions: string;
  noSuggestions: string;
}

export const DEFAULT_COMMERCE_AI_SEARCH_MESSAGES: CommerceAISearchMessages = {
  placeholder: "What are you looking for?",
  searchAriaLabel: "Search query",
  productSearchAriaLabel: "Product search",
  searchResultsAriaLabel: "Search results",
  searching: "Searching...",
  noProductsFound: "No products found",
  searchedFor: "Searched for:",
  dropImageToSearch: "Drop image to search",
  voiceSearch: "Voice search",
  stopRecording: "Stop recording",
  searchByCamera: "Search by camera",
  searchByImage: "Search by image",
  replayVoiceSummary: "Replay voice result summary",
  listening: "Listening…",
  tapMicToStop: "Tap mic to stop",
  understandingQuery: "Understanding your query…",
  preparingAudioSummary: "Preparing audio summary…",
  cameraCapture: "Camera capture",
  cameraPreview: "Camera preview",
  capturePhoto: "Capture",
  cancel: "Cancel",
  dismiss: "Dismiss",
  searchFailed: "Search failed",
  imageSearchFailed: "Image search failed",
  couldNotCapturePhoto: "Could not capture photo",
  suggestionsAriaLabel: "Search suggestions",
  loadingSuggestions: "Loading suggestions...",
  noSuggestions: "No suggestions",
};

export function resolveCommerceAISearchMessages(
  overrides?: Partial<CommerceAISearchMessages>,
): CommerceAISearchMessages {
  return {
    ...DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
    ...overrides,
  };
}
