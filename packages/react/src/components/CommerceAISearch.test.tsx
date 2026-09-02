import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  setResults: vi.fn(),
  setError: vi.fn(),
  setIsLoading: vi.fn(),
  clear: vi.fn(),
  startNewSearch: vi.fn(),
  hasFacetSession: false,
  refine: vi.fn(),
};

const defaultVoiceReturn = {
  isRecording: false,
  isProcessing: false,
  isLoadingTts: false,
  error: null,
  clearError: vi.fn(),
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
    expect(screen.getByText("Searching...")).not.toBeNull();
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

    expect(screen.getByText("No suggestions")).not.toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole("button", { name: "Added to cart" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add to cart" })).not.toBeNull();
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
});
