import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommerceAISearch } from "./CommerceAISearch.js";
import { useCommerceAISearch } from "../hooks/useCommerceAISearch.js";
import { useVoiceSearch } from "../hooks/useVoiceSearch.js";

vi.mock("../hooks/useCommerceAISearch.js");
vi.mock("../hooks/useVoiceSearch.js");

const mockUseCommerceAISearch = vi.mocked(useCommerceAISearch);
const mockUseVoiceSearch = vi.mocked(useVoiceSearch);

const defaultSearchReturn = {
  query: "",
  setQuery: vi.fn(),
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

describe("CommerceAISearch voice banner", () => {
  beforeEach(() => {
    mockUseCommerceAISearch.mockReturnValue(defaultSearchReturn);
    mockUseVoiceSearch.mockReturnValue(defaultVoiceReturn);
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
