import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommerceAISearch } from "./CommerceAISearch.js";
import { useCommerceAISearch } from "../hooks/useCommerceAISearch.js";
import { useCameraCapture } from "../hooks/useCameraCapture.js";
import { useVoiceSearch } from "../hooks/useVoiceSearch.js";

vi.mock("../hooks/useCommerceAISearch.js");
vi.mock("../hooks/useVoiceSearch.js");
vi.mock("../hooks/useCameraCapture.js");

const mockUseCommerceAISearch = vi.mocked(useCommerceAISearch);
const mockUseVoiceSearch = vi.mocked(useVoiceSearch);
const mockUseCameraCapture = vi.mocked(useCameraCapture);

const defaultSearchReturn = {
  query: "",
  setQuery: vi.fn(),
  suggestions: [],
  isLoadingSuggestions: false,
  suggestionsError: null,
  suggestionsReady: false,
  selectSuggestion: vi.fn(),
  results: [],
  meta: null,
  setMeta: vi.fn(),
  isLoading: false,
  hasSearched: false,
  setHasSearched: vi.fn(),
  error: null,
  search: vi.fn(),
  searchByImage: vi.fn(),
  setResults: vi.fn(),
  setError: vi.fn(),
  setIsLoading: vi.fn(),
  clear: vi.fn(),
};

const defaultVoiceReturn = {
  isRecording: false,
  isProcessing: false,
  isLoadingTts: false,
  error: null,
  audioSummary: null,
  clearAudioSummary: vi.fn(),
  replayAudioSummary: vi.fn(),
  toggleRecording: vi.fn(),
  stopRecording: vi.fn(),
};

const defaultCameraReturn = {
  isOpen: false,
  stream: null,
  error: null,
  facingMode: "environment" as const,
  open: vi.fn(),
  openOverlay: vi.fn(),
  capturePhoto: vi.fn(),
  close: vi.fn(),
  clearError: vi.fn(),
};

describe("CommerceAISearch voice banner", () => {
  beforeEach(() => {
    mockUseCommerceAISearch.mockReturnValue(defaultSearchReturn);
    mockUseVoiceSearch.mockReturnValue(defaultVoiceReturn);
    mockUseCameraCapture.mockReturnValue(defaultCameraReturn);
  });

  it("shows voice banner and active search bar while recording", () => {
    mockUseVoiceSearch.mockReturnValue({
      ...defaultVoiceReturn,
      isRecording: true,
    });

    const { container } = render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);

    expect(container.querySelector(".cat-search-bar--voice-active")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Listening…");
  });

  it("shows voice error banner without query text", () => {
    mockUseVoiceSearch.mockReturnValue({
      ...defaultVoiceReturn,
      error: "Microphone access denied",
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);

    expect(screen.getByRole("status").textContent).toContain("Microphone access denied");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("shows empty results state after a completed search with no products", () => {
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "nonexistent product",
      hasSearched: true,
      meta: {
        total: 0,
        limit: 20,
        offset: 0,
        locale: "en",
        catalogLocale: "en",
        queryLocale: "en",
        queryInterpretation: "obscure gadget",
      },
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);

    expect(screen.getByRole("listbox")).not.toBeNull();
    expect(screen.getByText("No products found")).not.toBeNull();
    expect(screen.getByText("Searched for: obscure gadget")).not.toBeNull();
  });
});

describe("CommerceAISearch autocomplete", () => {
  beforeEach(() => {
    mockUseCommerceAISearch.mockReturnValue(defaultSearchReturn);
    mockUseVoiceSearch.mockReturnValue(defaultVoiceReturn);
    mockUseCameraCapture.mockReturnValue(defaultCameraReturn);
  });

  it("shows suggestion errors in the suggestions panel", () => {
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "red",
      suggestionsError: "Suggestions unavailable",
      suggestionsReady: true,
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableAutocomplete />);

    expect(screen.getByRole("alert").textContent).toContain("Suggestions unavailable");
  });

  it("shows empty suggestions message after a ready fetch", () => {
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "zz",
      suggestionsReady: true,
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableAutocomplete />);

    expect(screen.getByText("No suggestions")).not.toBeNull();
  });
});

describe("CommerceAISearch camera search", () => {
  beforeEach(() => {
    mockUseCommerceAISearch.mockReturnValue(defaultSearchReturn);
    mockUseVoiceSearch.mockReturnValue(defaultVoiceReturn);
    mockUseCameraCapture.mockReturnValue(defaultCameraReturn);
  });

  it("shows camera button when camera search is enabled", () => {
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);

    expect(screen.getByRole("button", { name: "Search by camera" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Search by image" })).not.toBeNull();
  });

  it("hides camera button when camera search is disabled", () => {
    render(
      <CommerceAISearch apiBaseUrl="/api/commerce-ai" enableCameraSearch={false} />,
    );

    expect(screen.queryByRole("button", { name: "Search by camera" })).toBeNull();
    expect(screen.getByRole("button", { name: "Search by image" })).not.toBeNull();
  });

  it("opens camera capture when camera button is clicked", () => {
    const open = vi.fn();
    mockUseCameraCapture.mockReturnValue({
      ...defaultCameraReturn,
      open,
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);
    fireEvent.click(screen.getByRole("button", { name: "Search by camera" }));

    expect(open).toHaveBeenCalledTimes(1);
  });

  it("shows camera overlay when camera capture is open", () => {
    mockUseCameraCapture.mockReturnValue({
      ...defaultCameraReturn,
      isOpen: true,
      stream: { getTracks: () => [] } as unknown as MediaStream,
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);

    expect(screen.getByRole("dialog", { name: "Camera capture" })).not.toBeNull();
  });
});
