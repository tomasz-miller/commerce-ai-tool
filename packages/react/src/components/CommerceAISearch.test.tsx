import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommerceAISearchMessages } from "@commerce-ai-tool/core/client";
import { CommerceAISearch } from "./CommerceAISearch.js";
import { useCommerceAISearch } from "../hooks/useCommerceAISearch.js";
import { useCameraCapture } from "../hooks/useCameraCapture.js";
import { useCart } from "../hooks/useCart.js";
import { useVoiceSearch } from "../hooks/useVoiceSearch.js";

vi.mock("../hooks/useCommerceAISearch.js");
vi.mock("../hooks/useVoiceSearch.js");
vi.mock("../hooks/useCameraCapture.js");
vi.mock("../hooks/useCart.js");

const mockUseCommerceAISearch = vi.mocked(useCommerceAISearch);
const mockUseVoiceSearch = vi.mocked(useVoiceSearch);
const mockUseCameraCapture = vi.mocked(useCameraCapture);
const mockUseCart = vi.mocked(useCart);

const defaultSearchReturn = {
  query: "",
  setQuery: vi.fn(),
  suggestions: [],
  isLoadingSuggestions: false,
  suggestionsError: null,
  suggestionsReady: false,
  selectSuggestion: vi.fn(),
  results: [],
  mission: null,
  setMission: vi.fn(),
  meta: null,
  setMeta: vi.fn(),
  isLoading: false,
  hasSearched: false,
  setHasSearched: vi.fn(),
  error: null,
  search: vi.fn(),
  searchByImage: vi.fn(),
  beginExternalSearch: vi.fn(() => ({ requestId: 1, signal: new AbortController().signal })),
  isCurrentRequest: vi.fn(() => true),
  setResults: vi.fn(),
  setError: vi.fn(),
  setIsLoading: vi.fn(),
  clear: vi.fn(),
  startNewSearch: vi.fn(),
  applySearchResult: vi.fn(),
  hasFacetSession: false,
  refine: vi.fn(),
};

const defaultVoiceReturn = {
  isRecording: false,
  isProcessing: false,
  isLoadingTts: false,
  error: null,
  clearError: vi.fn(),
  audioClip: null,
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

const defaultCartReturn = {
  cart: null,
  anonymousId: "anon-1",
  customer: null,
  isAuthenticated: false,
  isLoading: false,
  isMutating: false,
  isLoggingIn: false,
  error: null,
  isCartOpen: false,
  openCart: vi.fn(),
  closeCart: vi.fn(),
  toggleCart: vi.fn(),
  addToCart: vi.fn(),
  addItems: vi.fn(),
  removeFromCart: vi.fn(),
  updateQuantity: vi.fn(),
  setAddresses: vi.fn(),
  getShippingMethods: vi.fn(),
  setShippingMethod: vi.fn(),
  getPaymentMethods: vi.fn(),
  authorizePayment: vi.fn(),
  getOrder: vi.fn(),
  listOrders: vi.fn(),
  placeOrder: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
};

describe("CommerceAISearch voice banner", () => {
  beforeEach(() => {
    mockUseCommerceAISearch.mockReturnValue(defaultSearchReturn);
    mockUseVoiceSearch.mockReturnValue(defaultVoiceReturn);
    mockUseCameraCapture.mockReturnValue(defaultCameraReturn);
    mockUseCart.mockReturnValue(defaultCartReturn);
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

  it("names the voice button after its action and does not also expose it as a toggle", () => {
    const { rerender } = render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);
    const idle = screen.getByRole("button", { name: "Voice search" });
    expect(idle.hasAttribute("aria-pressed")).toBe(false);

    mockUseVoiceSearch.mockReturnValue({ ...defaultVoiceReturn, isRecording: true });
    rerender(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);

    const recording = screen.getByRole("button", { name: "Stop recording" });
    expect(recording.hasAttribute("aria-pressed")).toBe(false);
  });

  it("shows voice error banner without query text", () => {
    mockUseVoiceSearch.mockReturnValue({
      ...defaultVoiceReturn,
      error: "Microphone access denied",
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);

    expect(screen.getByRole("alert").textContent).toContain("Microphone access denied");
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

    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("No products found");
    expect(screen.getByText("Searched for: obscure gadget")).not.toBeNull();
  });

  it("does not expose a results list while searching", () => {
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "glass",
      isLoading: true,
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);

    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getAllByText("Searching...")).toHaveLength(2);
  });
});

describe("CommerceAISearch live regions and combobox semantics", () => {
  const product = (id: string, name: string) => ({ id, name, slug: id });
  const suggestionState = {
    ...defaultSearchReturn,
    query: "red",
    suggestionsReady: true,
    suggestions: ["Red Shoes", "Red Boots"],
  };

  beforeEach(() => {
    mockUseCommerceAISearch.mockReturnValue(defaultSearchReturn);
    mockUseVoiceSearch.mockReturnValue(defaultVoiceReturn);
    mockUseCameraCapture.mockReturnValue(defaultCameraReturn);
    mockUseCart.mockReturnValue(defaultCartReturn);
  });

  it("announces result count after a search", () => {
    const { rerender } = render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);
    const region = screen.getByRole("status");
    expect(region.textContent).toBe("");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    expect(region.classList.contains("cat-visually-hidden")).toBe(true);

    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "glass",
      isLoading: true,
    });
    rerender(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);
    expect(screen.getByRole("status")).toBe(region);
    expect(region.textContent).toBe("Searching...");

    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "glass",
      hasSearched: true,
      results: [product("1", "Wine Glass"), product("2", "Tumbler")],
    });
    rerender(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);
    expect(screen.getByRole("status")).toBe(region);
    expect(region.textContent).toBe("Results: 2");
  });

  it("announces the empty state and voice states through the one live region", () => {
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "nothing",
      hasSearched: true,
    });
    const { rerender } = render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("No products found");

    mockUseCommerceAISearch.mockReturnValue(defaultSearchReturn);
    mockUseVoiceSearch.mockReturnValue({ ...defaultVoiceReturn, isRecording: true });
    rerender(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Listening…");
  });

  it("announces mission lane failures and empty lanes through the live region", () => {
    const lane = (id: string, products: { id: string; name: string }[], failed = false) => ({
      intent: { id, label: id, quantity: 1, searchTerms: [id] },
      products,
      total: products.length,
      ...(failed ? { failed: true } : {}),
    });
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "glasses, a table and chairs",
      hasSearched: true,
      results: [product("p1", "Wine Glass")],
      mission: {
        interpretation: "glasses, table and chairs",
        intents: [
          lane("glasses", [{ id: "p1", name: "Wine Glass" }]),
          lane("table", [], true),
          lane("chairs", []),
        ],
      },
    });
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableMissions />);

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe(
      "Results: 1. Couldn't search this item. No matching products",
    );
  });

  it("renders a search error with role alert only while an error exists", () => {
    const { rerender } = render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);
    expect(screen.queryByRole("alert")).toBeNull();

    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "glass",
      error: "Search failed",
    });
    rerender(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);
    expect(screen.getByRole("alert").textContent).toBe("Search failed");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("two widgets on one page have distinct listbox ids", () => {
    mockUseCommerceAISearch.mockReturnValue({ ...suggestionState });
    render(
      <>
        <CommerceAISearch apiBaseUrl="/api/commerce-ai" enableAutocomplete />
        <CommerceAISearch apiBaseUrl="/api/commerce-ai" enableAutocomplete />
      </>,
    );

    const listboxes = screen.getAllByRole("listbox");
    const inputs = screen.getAllByRole("combobox");
    expect(listboxes).toHaveLength(2);
    expect(listboxes[0]!.id).not.toBe("");
    expect(listboxes[0]!.id).not.toBe(listboxes[1]!.id);
    inputs.forEach((input, index) => {
      expect(input.getAttribute("aria-controls")).toBe(listboxes[index]!.id);
    });
    const ids = Array.from(document.querySelectorAll("[id]")).map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points aria-activedescendant at the active option of its own listbox", () => {
    mockUseCommerceAISearch.mockReturnValue({ ...suggestionState });
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableAutocomplete />);
    const input = screen.getByRole("combobox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    const active = input.getAttribute("aria-activedescendant")!;
    const option = document.getElementById(active)!;
    expect(option.textContent).toBe("Red Boots");
    expect(option.getAttribute("role")).toBe("option");
    expect(option.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("listbox").contains(option)).toBe(true);
  });

  it("marks Escape handled only while the listbox is open, so the cart does not also close", () => {
    mockUseCommerceAISearch.mockReturnValue({ ...suggestionState });
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableAutocomplete />);
    const input = screen.getByRole("combobox");

    // fireEvent returns false when a handler called preventDefault().
    expect(fireEvent.keyDown(input, { key: "Escape", cancelable: true })).toBe(false);
    // The listbox is now dismissed: the next Escape is not the combobox's.
    expect(fireEvent.keyDown(input, { key: "Escape", cancelable: true })).toBe(true);
  });

  it("listbox contains only option children", () => {
    mockUseCommerceAISearch.mockReturnValue({ ...suggestionState });
    const { rerender } = render(
      <CommerceAISearch apiBaseUrl="/api/commerce-ai" enableAutocomplete />,
    );
    const listbox = screen.getByRole("listbox");
    expect(Array.from(listbox.children).map((child) => child.getAttribute("role"))).toEqual([
      "option",
      "option",
    ]);
    expect(listbox.querySelectorAll("button, [role=alert], [role=status]")).toHaveLength(0);

    // Loading, error and empty rows are never listbox children: with no options there is no listbox.
    for (const state of [
      { suggestions: [], isLoadingSuggestions: true, suggestionsReady: false },
      { suggestions: [], suggestionsError: "Suggestions unavailable" },
      { suggestions: [], suggestionsReady: true },
    ]) {
      mockUseCommerceAISearch.mockReturnValue({ ...suggestionState, ...state });
      rerender(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableAutocomplete />);
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(screen.getByRole("combobox").getAttribute("aria-expanded")).toBe("false");
      expect(screen.getByRole("combobox").hasAttribute("aria-controls")).toBe(false);
    }
    for (const row of screen.getAllByText("No suggestions")) {
      expect(row.closest("[role=listbox]")).toBeNull();
    }
  });

  it("options are not tabbable", () => {
    mockUseCommerceAISearch.mockReturnValue({ ...suggestionState });
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableAutocomplete />);

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    for (const option of options) {
      expect(option.tagName).toBe("LI");
      expect(option.tabIndex).toBeLessThan(0);
      expect(option.querySelector("button, a, input, [tabindex]")).toBeNull();
    }
  });

  it("selects a suggestion on click without moving focus off the input", () => {
    const selectSuggestion = vi.fn();
    mockUseCommerceAISearch.mockReturnValue({ ...suggestionState, selectSuggestion });
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableAutocomplete />);
    const option = screen.getAllByRole("option")[1]!;

    const notPrevented = fireEvent.mouseDown(option);
    fireEvent.click(option);

    expect(notPrevented).toBe(false);
    expect(selectSuggestion).toHaveBeenCalledWith("Red Boots");
  });

  it("puts combobox state only on an input that is a combobox", () => {
    mockUseCommerceAISearch.mockReturnValue({ ...suggestionState });
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableAutocomplete={false} />);

    const input = screen.getByRole("searchbox");
    expect(input.hasAttribute("role")).toBe(false);
    for (const attribute of [
      "aria-expanded",
      "aria-controls",
      "aria-activedescendant",
      "aria-haspopup",
      "aria-autocomplete",
    ]) {
      expect(input.hasAttribute(attribute), attribute).toBe(false);
    }
  });

  it("keeps the recording timer out of any live region", () => {
    mockUseVoiceSearch.mockReturnValue({ ...defaultVoiceReturn, isRecording: true });
    const { container } = render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);

    const timer = container.querySelector(".cat-voice-banner__timer")!;
    expect(timer.getAttribute("role")).toBe("timer");
    expect(timer.closest("[aria-live]:not([aria-live=off])")).toBeNull();
    expect(timer.closest("[role=status], [role=alert]")).toBeNull();
  });
});

describe("CommerceAISearch autocomplete", () => {
  beforeEach(() => {
    mockUseCommerceAISearch.mockReturnValue(defaultSearchReturn);
    mockUseVoiceSearch.mockReturnValue(defaultVoiceReturn);
    mockUseCameraCapture.mockReturnValue(defaultCameraReturn);
    mockUseCart.mockReturnValue(defaultCartReturn);
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

    expect(screen.getAllByText("No suggestions")).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toBe("No suggestions");
  });

  it("hides suggestions when search results are visible", () => {
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "glass",
      suggestionsReady: true,
      suggestions: ["Wine Glass"],
      hasSearched: true,
      results: [
        {
          id: "1",
          name: "Chianti Wine Glass",
          slug: "chianti-wine-glass",
        },
      ],
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableAutocomplete />);

    expect(screen.queryByLabelText("Search suggestions")).toBeNull();
    expect(screen.queryByText("No suggestions")).toBeNull();
    expect(screen.getByText("Chianti Wine Glass")).not.toBeNull();
  });

  it("invokes onProductSelect from a result card", () => {
    const onProductSelect = vi.fn();
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "glass",
      hasSearched: true,
      results: [
        {
          id: "1",
          name: "Chianti Wine Glass",
          slug: "chianti-wine-glass",
        },
      ],
    });

    render(
      <CommerceAISearch
        apiBaseUrl="/api/commerce-ai"
        enableAutocomplete
        onProductSelect={onProductSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Chianti Wine Glass" }));
    expect(onProductSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "1", name: "Chianti Wine Glass" }),
    );
    expect(screen.getByRole("listitem").className).toContain("cat-result-card--featured");
  });

  it("marks only the first result card as featured", () => {
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "glass",
      hasSearched: true,
      results: [
        { id: "1", name: "Chianti Wine Glass", slug: "chianti-wine-glass" },
        { id: "2", name: "Harmony Drinking Glass", slug: "harmony-drinking-glass" },
      ],
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]?.className).toContain("cat-result-card--featured");
    expect(items[1]?.className).not.toContain("cat-result-card--featured");
  });
});

describe("CommerceAISearch camera search", () => {
  beforeEach(() => {
    mockUseCommerceAISearch.mockReturnValue(defaultSearchReturn);
    mockUseVoiceSearch.mockReturnValue(defaultVoiceReturn);
    mockUseCameraCapture.mockReturnValue(defaultCameraReturn);
    mockUseCart.mockReturnValue(defaultCartReturn);
  });

  it("shows camera button when camera search is enabled", () => {
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);

    expect(screen.getByRole("button", { name: "Search by camera" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Search by image" })).not.toBeNull();
  });

  it("hides camera button when camera search is disabled", () => {
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableCameraSearch={false} />);

    expect(screen.queryByRole("button", { name: "Search by camera" })).toBeNull();
    expect(screen.getByRole("button", { name: "Search by image" })).not.toBeNull();
  });

  it("configures voice, camera, and image upload independently", () => {
    const { rerender } = render(
      <CommerceAISearch
        apiBaseUrl="/api/commerce-ai"
        enableVoice
        enableCameraSearch={false}
        enableImageSearch={false}
      />,
    );

    expect(screen.getByRole("button", { name: "Voice search" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Search by camera" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Search by image" })).toBeNull();

    rerender(
      <CommerceAISearch
        apiBaseUrl="/api/commerce-ai"
        enableVoice={false}
        enableCameraSearch
        enableImageSearch={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "Voice search" })).toBeNull();
    expect(screen.getByRole("button", { name: "Search by camera" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Search by image" })).toBeNull();

    rerender(
      <CommerceAISearch
        apiBaseUrl="/api/commerce-ai"
        enableVoice={false}
        enableCameraSearch={false}
        enableImageSearch
      />,
    );

    expect(screen.queryByRole("button", { name: "Voice search" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Search by camera" })).toBeNull();
    expect(screen.getByRole("button", { name: "Search by image" })).not.toBeNull();
  });

  it("ignores image drops when image search is disabled", () => {
    const searchByImage = vi.fn();
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      searchByImage,
    });

    const { container } = render(
      <CommerceAISearch
        apiBaseUrl="/api/commerce-ai"
        enableImageSearch={false}
        enableCameraSearch={false}
      />,
    );
    const root = container.querySelector(".cat-wrapper");
    expect(root).not.toBeNull();

    fireEvent.drop(root!, {
      dataTransfer: {
        files: [new File(["x"], "shoe.png", { type: "image/png" })],
      },
    });

    expect(searchByImage).not.toHaveBeenCalled();
  });

  it("selecting the same image twice searches twice", () => {
    const searchByImage = vi.fn();
    mockUseCommerceAISearch.mockReturnValue({ ...defaultSearchReturn, searchByImage });

    const { container } = render(
      <CommerceAISearch
        apiBaseUrl="/api/commerce-ai"
        enableImageSearch
        enableCameraSearch={false}
      />,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    // A browser fires `change` only when the input's value differs from before, so the widget
    // must clear the value after reading the file. Model exactly that.
    let selected = "";
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => selected,
      set: (next: string) => {
        selected = next;
      },
    });
    const choose = (file: File) => {
      if (selected === file.name) return;
      selected = file.name;
      fireEvent.change(input!, { target: { files: [file] } });
    };

    const file = new File(["x"], "shoe.png", { type: "image/png" });
    choose(file);
    choose(file);

    expect(searchByImage).toHaveBeenCalledTimes(2);
    expect(searchByImage).toHaveBeenNthCalledWith(1, file);
    expect(searchByImage).toHaveBeenNthCalledWith(2, file);
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

describe("CommerceAISearch cart", () => {
  beforeEach(() => {
    mockUseCommerceAISearch.mockReturnValue(defaultSearchReturn);
    mockUseVoiceSearch.mockReturnValue(defaultVoiceReturn);
    mockUseCameraCapture.mockReturnValue(defaultCameraReturn);
    mockUseCart.mockReturnValue(defaultCartReturn);
  });

  it("hides cart controls by default", () => {
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" />);

    expect(screen.queryByRole("button", { name: "Shopping cart" })).toBeNull();
    expect(mockUseCart).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("shows the cart toggle and add-to-cart actions when enabled", () => {
    const addToCart = vi.fn();
    mockUseCart.mockReturnValue({
      ...defaultCartReturn,
      addToCart,
    });
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "glass",
      hasSearched: true,
      results: [{ id: "1", name: "Wine Glass", sku: "GLASS-1" }],
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableCart currency="EUR" />);

    expect(screen.getByRole("button", { name: "Shopping cart" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add Wine Glass to cart" }));
    expect(addToCart).toHaveBeenCalledWith({ sku: "GLASS-1" });
  });

  it("shows an item-count badge on the cart toggle when the cart has items", () => {
    mockUseCart.mockReturnValue({
      ...defaultCartReturn,
      cart: {
        id: "cart-1",
        version: 1,
        lineItems: [],
        totalPrice: { amount: 0, currency: "EUR", formatted: "€0.00" },
        totalQuantity: 3,
      },
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableCart />);

    const toggle = screen.getByRole("button", { name: "Shopping cart (3)" });
    expect(toggle.querySelector(".cat-cart-badge")?.textContent).toBe("3");
  });

  it("add-to-cart button name includes the product name", () => {
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "glass",
      hasSearched: true,
      results: [
        { id: "1", name: "Wine Glass", sku: "GLASS-1" },
        { id: "2", name: "Water Carafe", sku: "CARAFE-1" },
        { id: "3", name: "Unlisted Tumbler" },
      ],
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableCart currency="EUR" />);

    expect(screen.getByRole("button", { name: "Add Wine Glass to cart" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add Water Carafe to cart" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Add to cart" })).toBeNull();
  });

  it("uses the host's own addToCart wording in the product-named label", () => {
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "glass",
      hasSearched: true,
      results: [{ id: "1", name: "Kieliszek", sku: "GLASS-1" }],
    });

    render(
      <CommerceAISearch
        apiBaseUrl="/api/commerce-ai"
        enableCart
        currency="EUR"
        messages={{ addToCart: "Dodaj do koszyka" } as Partial<CommerceAISearchMessages>}
      />,
    );

    expect(screen.getByRole("button", { name: "Dodaj do koszyka: Kieliszek" })).not.toBeNull();
  });

  it("exposes the cart toggle as a disclosure with aria-expanded only", () => {
    mockUseCart.mockReturnValue({ ...defaultCartReturn, isCartOpen: true });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableCart />);

    const toggle = screen.getByRole("button", { name: "Shopping cart" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.hasAttribute("aria-pressed")).toBe(false);
  });

  it("returns focus to the cart toggle when the cart closes", () => {
    mockUseCart.mockReturnValue({ ...defaultCartReturn, isCartOpen: true });
    const view = render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableCart />);
    screen.getByRole("button", { name: "Close cart" }).focus();

    mockUseCart.mockReturnValue({ ...defaultCartReturn, isCartOpen: false });
    view.rerender(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableCart />);

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Shopping cart" }));
  });

  it("hides the cart badge when the cart is empty", () => {
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableCart />);

    const toggle = screen.getByRole("button", { name: "Shopping cart" });
    expect(toggle.querySelector(".cat-cart-badge")).toBeNull();
  });

  it("falls back to productId when the card has no sku", () => {
    const addToCart = vi.fn();
    mockUseCart.mockReturnValue({
      ...defaultCartReturn,
      addToCart,
    });
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "glass",
      hasSearched: true,
      results: [{ id: "1", name: "Wine Glass", variantId: 2 }],
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableCart />);
    fireEvent.click(screen.getByRole("button", { name: "Add Wine Glass to cart" }));

    expect(addToCart).toHaveBeenCalledWith({ productId: "1", variantId: 2 });
  });

  it("shows added feedback only after a successful add", async () => {
    const addToCart = vi.fn().mockResolvedValue({
      id: "cart-1",
      version: 1,
      lineItems: [],
      totalPrice: { amount: 0, currency: "EUR", formatted: "€0.00" },
      totalQuantity: 1,
    });
    mockUseCart.mockReturnValue({
      ...defaultCartReturn,
      addToCart,
    });
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "glass",
      hasSearched: true,
      results: [{ id: "1", name: "Wine Glass", sku: "GLASS-1" }],
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableCart />);
    fireEvent.click(screen.getByRole("button", { name: "Add Wine Glass to cart" }));

    expect(await screen.findByRole("button", { name: "Added to cart" })).not.toBeNull();
  });

  it("does not show added feedback when add to cart fails", async () => {
    const addToCart = vi.fn().mockResolvedValue(null);
    mockUseCart.mockReturnValue({
      ...defaultCartReturn,
      addToCart,
    });
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "glass",
      hasSearched: true,
      results: [{ id: "1", name: "Wine Glass", sku: "GLASS-1" }],
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableCart />);
    fireEvent.click(screen.getByRole("button", { name: "Add Wine Glass to cart" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole("button", { name: "Added to cart" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add Wine Glass to cart" })).not.toBeNull();
  });

  it("opens the cart panel when the hook reports it open", () => {
    mockUseCart.mockReturnValue({
      ...defaultCartReturn,
      isCartOpen: true,
      cart: {
        id: "cart-1",
        version: 1,
        lineItems: [],
        totalPrice: { amount: 0, currency: "EUR", formatted: "€0.00" },
        totalQuantity: 0,
      },
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableCart />);

    expect(screen.getByText("Your cart is empty")).not.toBeNull();
  });

  it("runs a fresh search on submit after a mission, even when facets were enabled", () => {
    const search = vi.fn();
    const refine = vi.fn();
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "a racket and two balls",
      hasSearched: true,
      hasFacetSession: false,
      search,
      refine,
      mission: {
        interpretation: "racket and balls",
        intents: [
          {
            intent: { id: "intent-0", label: "racket", quantity: 1, searchTerms: ["racket"] },
            products: [{ id: "p1", name: "Racket" }],
            total: 1,
          },
        ],
      },
      meta: {
        total: 1,
        limit: 4,
        offset: 0,
        locale: "en",
        catalogLocale: "en",
        queryLocale: "en",
        searchTerms: ["racket", "balls"],
      },
    });

    const { container } = render(
      <CommerceAISearch apiBaseUrl="/api/commerce-ai" enableFacets enableMissions />,
    );
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(search).toHaveBeenCalledWith("a racket and two balls");
    expect(refine).not.toHaveBeenCalled();
  });

  it("renders mission lanes outside the product grid without stretching two lanes", () => {
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "glasses, a table, and chairs",
      hasSearched: true,
      results: [
        { id: "p1", name: "Wine Glass", sku: "GLASS-1" },
        { id: "p2", name: "Dining Table", sku: "TABLE-1" },
      ],
      mission: {
        interpretation: "glasses, table, and chairs",
        intents: [
          {
            intent: { id: "intent-0", label: "glasses", quantity: 1, searchTerms: ["glasses"] },
            products: [{ id: "p1", name: "Wine Glass", sku: "GLASS-1" }],
            total: 1,
          },
          {
            intent: { id: "intent-1", label: "table", quantity: 1, searchTerms: ["table"] },
            products: [{ id: "p2", name: "Dining Table", sku: "TABLE-1" }],
            total: 1,
          },
        ],
      },
    });

    const { container } = render(
      <CommerceAISearch apiBaseUrl="/api/commerce-ai" enableCart enableMissions />,
    );

    expect(container.querySelector(".cat-root--mission")).not.toBeNull();
    expect(container.querySelector(".cat-root--mission-lanes-2")).not.toBeNull();
    expect(container.querySelector(".cat-mission")).not.toBeNull();
    expect(container.querySelector(".cat-results")).toBeNull();
    expect(container.querySelector(".cat-results .cat-mission")).toBeNull();
    expect(container.querySelector(".cat-result-card--primary")).not.toBeNull();
    expect(screen.getByText("glasses")).not.toBeNull();
    expect(screen.getByText("table")).not.toBeNull();
  });

  it("widens the root when a mission has three or more lanes", () => {
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "glasses, a table, and chairs",
      hasSearched: true,
      results: [
        { id: "p1", name: "Wine Glass", sku: "GLASS-1" },
        { id: "p2", name: "Dining Table", sku: "TABLE-1" },
        { id: "p3", name: "Lounge Chair", sku: "CHAIR-1" },
      ],
      mission: {
        interpretation: "glasses, table, and chairs",
        intents: [
          {
            intent: { id: "intent-0", label: "glasses", quantity: 1, searchTerms: ["glasses"] },
            products: [{ id: "p1", name: "Wine Glass", sku: "GLASS-1" }],
            total: 1,
          },
          {
            intent: { id: "intent-1", label: "table", quantity: 1, searchTerms: ["table"] },
            products: [{ id: "p2", name: "Dining Table", sku: "TABLE-1" }],
            total: 1,
          },
          {
            intent: { id: "intent-2", label: "chairs", quantity: 1, searchTerms: ["chairs"] },
            products: [{ id: "p3", name: "Lounge Chair", sku: "CHAIR-1" }],
            total: 1,
          },
        ],
      },
    });

    const { container } = render(
      <CommerceAISearch apiBaseUrl="/api/commerce-ai" enableCart enableMissions />,
    );

    expect(container.querySelector(".cat-root--mission-lanes-3")).not.toBeNull();
    expect(container.querySelector(".cat-root--mission-lanes-2")).toBeNull();
  });

  it("refines on submit when a facet session is active", () => {
    const search = vi.fn();
    const refine = vi.fn();
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "taller glasses",
      hasSearched: true,
      hasFacetSession: true,
      search,
      refine,
      meta: {
        total: 1,
        limit: 20,
        offset: 0,
        locale: "en",
        catalogLocale: "en",
        queryLocale: "en",
        searchTerms: ["glasses"],
      },
    });

    const { container } = render(
      <CommerceAISearch apiBaseUrl="/api/commerce-ai" enableFacets />,
    );
    fireEvent.submit(container.querySelector("form")!);

    expect(refine).toHaveBeenCalledWith("taller glasses");
    expect(search).not.toHaveBeenCalled();
  });

  it("runs a fresh search on submit when missions are enabled, even with a facet session", () => {
    const search = vi.fn();
    const refine = vi.fn();
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "I'm looking for some glasses and a coffee table",
      hasSearched: true,
      hasFacetSession: true,
      search,
      refine,
      meta: {
        total: 1,
        limit: 20,
        offset: 0,
        locale: "en",
        catalogLocale: "en",
        queryLocale: "en",
        searchTerms: ["glasses"],
      },
    });

    const { container } = render(
      <CommerceAISearch apiBaseUrl="/api/commerce-ai" enableFacets enableMissions />,
    );
    fireEvent.submit(container.querySelector("form")!);

    expect(search).toHaveBeenCalledWith("I'm looking for some glasses and a coffee table");
    expect(refine).not.toHaveBeenCalled();
  });

  it("refines a non-compound query on submit when missions and a facet session are both on", () => {
    const search = vi.fn();
    const refine = vi.fn();
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      query: "taller glasses",
      hasSearched: true,
      hasFacetSession: true,
      search,
      refine,
      meta: {
        total: 1,
        limit: 20,
        offset: 0,
        locale: "en",
        catalogLocale: "en",
        queryLocale: "en",
        searchTerms: ["glasses"],
      },
    });

    const { container } = render(
      <CommerceAISearch apiBaseUrl="/api/commerce-ai" enableFacets enableMissions />,
    );
    fireEvent.submit(container.querySelector("form")!);

    expect(refine).toHaveBeenCalledWith("taller glasses");
    expect(search).not.toHaveBeenCalled();
  });

  it("orders voice searches against the text and image searches", () => {
    const beginExternalSearch = vi.fn();
    const isCurrentRequest = vi.fn();
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      beginExternalSearch,
      isCurrentRequest,
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableVoice />);

    expect(mockUseVoiceSearch).toHaveBeenCalledWith(
      expect.objectContaining({ beginExternalSearch, isCurrentRequest }),
    );
  });

  it("passes enableMissions to voice search and applies mission results", () => {
    const applySearchResult = vi.fn();
    mockUseCommerceAISearch.mockReturnValue({
      ...defaultSearchReturn,
      applySearchResult,
    });

    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" enableMissions />);

    expect(mockUseVoiceSearch).toHaveBeenCalledWith(
      expect.objectContaining({ enableMissions: true }),
    );

    const onResults = mockUseVoiceSearch.mock.calls.at(-1)?.[0]?.onResults;
    const mission = {
      interpretation: "glasses and table",
      intents: [
        {
          intent: { id: "intent-0", label: "glasses", quantity: 1, searchTerms: ["glasses"] },
          products: [{ id: "p1", name: "Wine Glass" }],
          total: 1,
        },
      ],
    };
    const meta = {
      total: 1,
      limit: 4,
      offset: 0,
      locale: "en",
      catalogLocale: "en",
      queryLocale: "en",
      searchTerms: ["glasses"],
    };

    act(() => {
      onResults?.([], meta, { mission });
    });

    expect(applySearchResult).toHaveBeenCalledWith(
      expect.objectContaining({ mission, products: [], meta }),
    );
  });
});
