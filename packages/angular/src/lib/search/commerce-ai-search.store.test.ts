import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ProductCard, SearchResult } from "@commerce-ai-tool/core/client";
import { CommerceAiApiService } from "../commerce-ai-api.service";
import { CommerceAiCartService } from "../commerce-ai-cart.service";
import { CommerceAiSearchStore } from "./commerce-ai-search.store";

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

const meta = { total: 1, limit: 20, offset: 0, locale: "en", catalogLocale: "en", queryLocale: "en" };
const shoe: ProductCard = { id: "p1", name: "Running Shoe", slug: "running-shoe", sku: "SHOE-1" };

function searchResult(extra: Partial<SearchResult> = {}): SearchResult {
  return { products: [shoe], meta: { ...meta, searchTerms: ["shoe"] }, ...extra };
}

function createStore(api: Partial<Record<keyof CommerceAiApiService, unknown>> = {}) {
  const cart = {
    cart: () => null,
    configure: vi.fn(),
    addToCart: vi.fn().mockResolvedValue({ id: "cart-1" }),
  };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: CommerceAiApiService, useValue: api },
      { provide: CommerceAiCartService, useValue: cart },
      CommerceAiSearchStore,
    ],
  });
  return { store: TestBed.inject(CommerceAiSearchStore), cart };
}

describe("CommerceAiSearchStore", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it("gives every instance its own id prefix", () => {
    const first = createStore().store;
    TestBed.resetTestingModule();
    const second = createStore().store;

    expect(first.uid).not.toBe(second.uid);
    expect(first.listboxId).not.toBe(second.listboxId);
  });

  it("ties the active descendant id to the listbox id", () => {
    const { store } = createStore();
    expect(store.activeSuggestionId()).toBeNull();

    store.activeSuggestionIndex.set(2);

    expect(store.activeSuggestionId()).toBe(`${store.listboxId}-option-2`);
  });

  it("marks Escape handled only while the listbox is open, so the cart does not also close", () => {
    const { store } = createStore();
    store.enableAutocomplete.set(true);
    store.query.set("red");
    store.suggestionsReady.set(true);
    store.suggestions.set(["Red Shoes"]);

    const open = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    store.onInputKeyDown(open);
    expect(open.defaultPrevented).toBe(true);

    // Dismissed now: the next Escape is not the combobox's.
    const closed = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    store.onInputKeyDown(closed);
    expect(closed.defaultPrevented).toBe(false);
  });

  it("derives the resolved messages from the messages and placeholder inputs", () => {
    const { store } = createStore();
    store.placeholder.set("Find shoes");
    expect(store.resolvedMessages().placeholder).toBe("Find shoes");

    store.messages.set({ searching: "Looking...", placeholder: "Custom" });
    expect(store.resolvedMessages().searching).toBe("Looking...");
    expect(store.resolvedMessages().placeholder).toBe("Custom");
  });

  it("shows suggestions only for autocomplete, a long enough query and no results", () => {
    const { store } = createStore();
    store.query.set("sh");
    store.suggestionsReady.set(true);
    expect(store.showSuggestions()).toBe(false);

    store.enableAutocomplete.set(true);
    expect(store.showSuggestions()).toBe(true);

    store.suggestionsDismissed.set(true);
    expect(store.showSuggestions()).toBe(false);
  });

  it("applies a text search result and starts a facet session only with facets on", async () => {
    const api = { search: vi.fn().mockResolvedValue(searchResult()) };
    const { store } = createStore(api);
    store.enableFacets.set(true);
    store.query.set("running shoes");

    await store.submit();

    expect(store.results()).toEqual([shoe]);
    expect(store.hasSearched()).toBe(true);
    expect(store.isLoading()).toBe(false);
    expect(store.hasFacetSession()).toBe(true);
    expect(api.search).toHaveBeenCalledWith(
      "/api/commerce-ai",
      "running shoes",
      { catalogLocale: undefined, queryLocale: undefined, locale: undefined },
      expect.any(AbortSignal),
      expect.objectContaining({ includeFacets: true }),
    );
  });

  it("reads the api base url and locales from the configuration signals", async () => {
    const api = { search: vi.fn().mockResolvedValue(searchResult()) };
    const { store } = createStore(api);
    store.apiBaseUrl.set("/shop/api");
    store.catalogLocale.set("de-DE");
    store.queryLocale.set("pl");
    store.query.set("buty");

    await store.submit();

    expect(api.search).toHaveBeenCalledWith(
      "/shop/api",
      "buty",
      { catalogLocale: "de-DE", queryLocale: "pl", locale: undefined },
      expect.any(AbortSignal),
      expect.anything(),
    );
  });

  it("marks a product as added for a moment after the cart accepted it", async () => {
    vi.useFakeTimers();
    const { store, cart } = createStore();

    await store.addToCart(shoe);
    expect(cart.addToCart).toHaveBeenCalledTimes(1);
    expect(store.addedProductIds()).toEqual({ p1: true });
    expect(store.addToCartLabel(shoe)).toBe(store.resolvedMessages().itemAdded);

    vi.advanceTimersByTime(1200);
    expect(store.addedProductIds()).toEqual({});
  });

  it("aborts an in-flight search and ignores its result after destroy", async () => {
    let signal!: AbortSignal;
    let resolve!: (value: SearchResult) => void;
    const api = {
      search: vi.fn((_base: string, _q: string, _l: unknown, abort: AbortSignal) => {
        signal = abort;
        return new Promise<SearchResult>((res) => {
          resolve = res;
        });
      }),
    };
    const { store } = createStore(api);
    store.query.set("shoes");

    const pending = store.submit();
    store.teardown();
    resolve(searchResult());
    await pending;

    expect(signal.aborted).toBe(true);
    expect(store.results()).toEqual([]);
  });
});
