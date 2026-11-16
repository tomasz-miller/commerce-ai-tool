import { ElementRef, provideZonelessChangeDetection, type Provider } from "@angular/core";
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  CommerceAIApiError,
  DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
  type MissionSearchResult,
  type ProductCard,
  type SearchFacetGroup,
  type SearchResult,
} from "@commerce-ai-tool/core/client";
import { CommerceAiApiService } from "./commerce-ai-api.service";
import { CommerceAiSearchComponent } from "./commerce-ai-search.component";
import type { CommerceAiSearchStore } from "./search/commerce-ai-search.store";

// The whole suite runs zoneless (no zone.js): every assertion about rendered output below relies on
// signals notifying the scheduler, never on a manual `detectChanges()` after an async result.
beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

type Api = {
  suggest: Mock;
  search: Mock;
  searchByImage: Mock;
  searchByVoice: Mock;
  synthesizeSpeech: Mock;
};

function createApi(overrides: Partial<Api> = {}): Api {
  return {
    suggest: vi.fn(),
    search: vi.fn(),
    searchByImage: vi.fn(),
    searchByVoice: vi.fn(),
    synthesizeSpeech: vi.fn(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Rejects with an `AbortError` as soon as `signal` aborts, like `fetch`. */
function abortable<T>(signal: AbortSignal): { promise: Promise<T>; resolve: (value: T) => void } {
  const pending = deferred<T>();
  signal.addEventListener("abort", () => {
    pending.reject(new DOMException("aborted", "AbortError"));
  });
  return { promise: pending.promise, resolve: pending.resolve };
}

async function render(
  api: Api = createApi(),
  inputs: Record<string, unknown> = {},
  providers: Provider[] = [],
): Promise<ComponentFixture<CommerceAiSearchComponent>> {
  await TestBed.configureTestingModule({
    imports: [CommerceAiSearchComponent],
    providers: [
      provideZonelessChangeDetection(),
      { provide: CommerceAiApiService, useValue: api },
      ...providers,
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(CommerceAiSearchComponent);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture;
}

const meta = {
  total: 1,
  limit: 20,
  offset: 0,
  locale: "en",
  catalogLocale: "en",
  queryLocale: "en",
};

const shoe: ProductCard = { id: "p1", name: "Running Shoe", slug: "running-shoe", sku: "SHOE-1" };
const boot: ProductCard = { id: "p2", name: "Winter Boot", slug: "winter-boot", sku: "BOOT-1" };

function searchResult(products: ProductCard[] = [shoe], extra: Partial<SearchResult> = {}): SearchResult {
  return { products, meta, ...extra };
}

function cards(fixture: ComponentFixture<unknown>): string[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll(".cat-results .cat-result-name"),
  ).map((element) => element.textContent?.trim() ?? "");
}

function queryInput(fixture: ComponentFixture<unknown>): HTMLInputElement {
  return (fixture.nativeElement as HTMLElement).querySelector(".cat-search-input") as HTMLInputElement;
}

function typeQuery(fixture: ComponentFixture<unknown>, value: string): void {
  const input = queryInput(fixture);
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

function clickByLabel(fixture: ComponentFixture<unknown>, label: string): void {
  const button = (fixture.nativeElement as HTMLElement).querySelector(
    `[aria-label="${label}"]`,
  ) as HTMLButtonElement | null;
  expect(button, `button "${label}"`).not.toBeNull();
  button!.click();
}

/** The async bodies behind the void public handlers, so a test can await them. */
function run(cmp: CommerceAiSearchComponent) {
  const store = (cmp as unknown as { store: CommerceAiSearchStore }).store;
  return {
    runSubmit: () => store.submit(),
    runImageSearch: (file: File) => store.searchByImage(file),
    runToggleFacet: (facetId: string, key: string, currency?: string) =>
      store.toggleFacet(facetId, key, currency),
    runClearFacetFilters: () => store.clearFacetFilters(),
    runStartNewSearch: () => store.startNewSearch(),
  };
}

const imageFile = () => new File(["x"], "shoe.png", { type: "image/png" });

describe("CommerceAiSearchComponent", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, "mediaDevices");
  });

  it("merges custom messages with defaults", async () => {
    const fixture = await render(createApi(), { messages: { searching: "Looking up products..." } });

    expect(fixture.componentInstance.resolvedMessages.searching).toBe("Looking up products...");
    expect(fixture.componentInstance.resolvedMessages.placeholder).toBe("What are you looking for?");
  });

  it("configures voice, camera, and image upload independently", async () => {
    const fixture = await render(createApi(), {
      enableVoice: false,
      enableCameraSearch: true,
      enableImageSearch: false,
    });

    expect(fixture.nativeElement.querySelector('[aria-label="Voice search"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Search by camera"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Search by image"]')).toBeNull();
  });

  it("ignores image drops when image search is disabled", async () => {
    const api = createApi();
    const fixture = await render(api, { enableImageSearch: false });

    fixture.componentInstance.onDrop({
      preventDefault() {},
      dataTransfer: { files: [imageFile()] },
    } as unknown as DragEvent);

    expect(api.searchByImage).not.toHaveBeenCalled();
  });

  it("shows the drop overlay on dragover and hides it on dragleave", async () => {
    const fixture = await render();
    const root = fixture.nativeElement.querySelector(".cat-root") as HTMLElement;

    root.dispatchEvent(new Event("dragover", { cancelable: true }));
    await vi.waitFor(() => expect(fixture.nativeElement.querySelector(".cat-drag-overlay")).not.toBeNull());

    root.dispatchEvent(new Event("dragleave"));
    await vi.waitFor(() => expect(fixture.nativeElement.querySelector(".cat-drag-overlay")).toBeNull());
  });

  it("fetches suggestions when autocomplete is enabled", async () => {
    const api = createApi({ suggest: vi.fn().mockResolvedValue({ suggestions: ["Red Shoes"] }) });
    const fixture = await render(api, { enableAutocomplete: true });

    typeQuery(fixture, "red");

    await vi.waitFor(() => {
      expect(fixture.nativeElement.querySelector(".cat-suggestions__item")?.textContent).toContain(
        "Red Shoes",
      );
    });
    expect(api.suggest).toHaveBeenCalledWith(
      "/api/commerce-ai",
      "red",
      expect.objectContaining({ catalogLocale: undefined }),
      expect.any(AbortSignal),
    );
  });

  it("hides suggestions when search results are visible", async () => {
    const fixture = await render(createApi(), { enableAutocomplete: true });
    const cmp = fixture.componentInstance;
    cmp.query = "glass";
    cmp.suggestionsReady = true;
    cmp.suggestions = ["Wine Glass"];
    cmp.hasSearched = true;
    cmp.results = [{ id: "1", name: "Chianti Wine Glass", slug: "chianti-wine-glass" }];
    await fixture.whenStable();

    expect(cmp.showResults).toBe(true);
    expect(cmp.showSuggestions).toBe(false);
    expect(fixture.nativeElement.querySelector(".cat-suggestions")).toBeNull();
  });

  it("clears results when typing so suggestions can show after a search", async () => {
    const fixture = await render(createApi({ suggest: vi.fn() }), { enableAutocomplete: true });
    const cmp = fixture.componentInstance;
    cmp.query = "glass";
    cmp.hasSearched = true;
    cmp.results = [{ id: "1", name: "Chianti Wine Glass", slug: "chianti-wine-glass" }];
    await fixture.whenStable();

    cmp.onQueryChange("wi");

    expect(cmp.results).toEqual([]);
    expect(cmp.hasSearched).toBe(false);
    expect(cmp.isLoadingSuggestions).toBe(true);
  });

  it("two widgets on one page get distinct ids and each input points at its own listbox", async () => {
    await TestBed.configureTestingModule({
      imports: [CommerceAiSearchComponent],
      providers: [provideZonelessChangeDetection(), { provide: CommerceAiApiService, useValue: createApi() }],
    }).compileComponents();
    const fixtures = [0, 1].map(() => {
      const fixture = TestBed.createComponent(CommerceAiSearchComponent);
      fixture.componentRef.setInput("enableAutocomplete", true);
      return fixture;
    });
    await Promise.all(fixtures.map((fixture) => fixture.whenStable()));
    for (const fixture of fixtures) {
      const cmp = fixture.componentInstance;
      cmp.query = "red";
      cmp.suggestionsReady = true;
      cmp.suggestions = ["Red Shoes", "Red Boots"];
      cmp.activeSuggestionIndex = 1;
      await fixture.whenStable();
    }

    const inputs = fixtures.map((fixture) => queryInput(fixture));
    const listboxes = fixtures.map(
      (fixture) => (fixture.nativeElement as HTMLElement).querySelector('[role="listbox"]') as HTMLElement,
    );
    expect(listboxes[0]!.id).not.toBe(listboxes[1]!.id);
    for (const [index, fixture] of fixtures.entries()) {
      const root = fixture.nativeElement as HTMLElement;
      expect(inputs[index]!.getAttribute("aria-controls")).toBe(listboxes[index]!.id);
      const active = inputs[index]!.getAttribute("aria-activedescendant")!;
      expect(root.querySelector(`#${active}`)?.textContent?.trim()).toBe("Red Boots");
    }
    const allIds = fixtures.flatMap((fixture) =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll("[id]")).map((element) => element.id),
    );
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds).toHaveLength(6);
  });

  describe("live regions and combobox semantics (UX-03, UX-04)", () => {
    const suggestionInputs = { enableAutocomplete: true };

    async function renderWithSuggestions(
      inputs: Record<string, unknown> = suggestionInputs,
    ): Promise<ComponentFixture<CommerceAiSearchComponent>> {
      const fixture = await render(createApi(), inputs);
      const cmp = fixture.componentInstance;
      cmp.query = "red";
      cmp.suggestionsReady = true;
      cmp.suggestions = ["Red Shoes", "Red Boots"];
      await fixture.whenStable();
      return fixture;
    }

    const liveRegion = (fixture: ComponentFixture<unknown>) =>
      (fixture.nativeElement as HTMLElement).querySelector('[role="status"]') as HTMLElement;

    it("announces result count after a search", async () => {
      const api = createApi({
        search: vi.fn().mockResolvedValue(searchResult([shoe, boot])),
      });
      const fixture = await render(api);
      const region = liveRegion(fixture);
      expect(region.textContent?.trim()).toBe("");
      expect(region.getAttribute("aria-live")).toBe("polite");
      expect(region.getAttribute("aria-atomic")).toBe("true");
      expect(region.classList.contains("cat-visually-hidden")).toBe(true);

      typeQuery(fixture, "shoes");
      await vi.waitFor(() => expect(region.textContent?.trim()).toBe("Searching..."));
      await vi.waitFor(() => expect(region.textContent?.trim()).toBe("Results: 2"));
      expect(liveRegion(fixture)).toBe(region);
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('[role="status"]')).toHaveLength(1);
    });

    it("announces the empty state and voice states through the one live region", async () => {
      const fixture = await render(createApi({ search: vi.fn().mockResolvedValue(searchResult([])) }));
      const cmp = fixture.componentInstance;
      cmp.query = "nothing";
      cmp.hasSearched = true;
      await fixture.whenStable();
      expect(liveRegion(fixture).textContent?.trim()).toBe("No products found");

      cmp.query = "";
      cmp.hasSearched = false;
      cmp.isRecording = true;
      await fixture.whenStable();
      expect(liveRegion(fixture).textContent?.trim()).toBe("Listening…");
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('[role="status"]')).toHaveLength(1);
    });

    it("announces mission lane failures and empty lanes through the live region", async () => {
      const fixture = await render(createApi(), { enableMissions: true });
      const cmp = fixture.componentInstance;
      cmp.query = "glasses, a table and chairs";
      cmp.hasSearched = true;
      cmp.mission = {
        interpretation: "glasses, table and chairs",
        intents: [
          {
            intent: { id: "intent-0", label: "glasses", quantity: 1, searchTerms: ["glasses"] },
            products: [{ id: "p1", name: "Wine Glass" }],
            total: 1,
          },
          {
            intent: { id: "intent-1", label: "table", quantity: 1, searchTerms: ["table"] },
            products: [],
            total: 0,
            failed: true,
          },
          {
            intent: { id: "intent-2", label: "chairs", quantity: 1, searchTerms: ["chairs"] },
            products: [],
            total: 0,
          },
        ],
      };
      await fixture.whenStable();

      expect((fixture.nativeElement as HTMLElement).querySelectorAll('[role="status"]')).toHaveLength(1);
      expect(liveRegion(fixture).textContent?.trim()).toBe(
        "Results: 1. Couldn't search this item. No matching products",
      );
    });

    it("renders a search error with role alert only while an error exists", async () => {
      const fixture = await render();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('[role="alert"]')).toBeNull();

      const cmp = fixture.componentInstance;
      cmp.query = "glass";
      cmp.error = "Search failed";
      await fixture.whenStable();

      expect(root.querySelector('[role="alert"]')?.textContent?.trim()).toBe("Search failed");
      expect(liveRegion(fixture).textContent?.trim()).toBe("");
    });

    it("two widgets on one page have distinct listbox ids", async () => {
      await TestBed.configureTestingModule({
        imports: [CommerceAiSearchComponent],
        providers: [provideZonelessChangeDetection(), { provide: CommerceAiApiService, useValue: createApi() }],
      }).compileComponents();
      const fixtures = [0, 1].map(() => {
        const fixture = TestBed.createComponent(CommerceAiSearchComponent);
        fixture.componentRef.setInput("enableAutocomplete", true);
        return fixture;
      });
      await Promise.all(fixtures.map((fixture) => fixture.whenStable()));
      for (const fixture of fixtures) {
        const cmp = fixture.componentInstance;
        cmp.query = "red";
        cmp.suggestionsReady = true;
        cmp.suggestions = ["Red Shoes", "Red Boots"];
        cmp.activeSuggestionIndex = 0;
        await fixture.whenStable();
      }

      const listboxes = fixtures.map(
        (fixture) => (fixture.nativeElement as HTMLElement).querySelector('[role="listbox"]') as HTMLElement,
      );
      expect(listboxes[0]!.id).not.toBe("");
      expect(listboxes[0]!.id).not.toBe(listboxes[1]!.id);
      fixtures.forEach((fixture, index) => {
        expect(queryInput(fixture).getAttribute("aria-controls")).toBe(listboxes[index]!.id);
        const active = queryInput(fixture).getAttribute("aria-activedescendant")!;
        expect(listboxes[index]!.querySelector(`#${active}`)).not.toBeNull();
      });
      const allIds = fixtures.flatMap((fixture) =>
        Array.from((fixture.nativeElement as HTMLElement).querySelectorAll("[id]")).map((element) => element.id),
      );
      expect(new Set(allIds).size).toBe(allIds.length);
    });

    it("listbox contains only option children", async () => {
      const fixture = await renderWithSuggestions();
      const root = fixture.nativeElement as HTMLElement;
      const listbox = root.querySelector('[role="listbox"]') as HTMLElement;

      expect(Array.from(listbox.children).map((child) => child.getAttribute("role"))).toEqual([
        "option",
        "option",
      ]);
      expect(listbox.querySelectorAll("button, [role=alert], [role=status]")).toHaveLength(0);

      // Loading, error and empty rows are never listbox children: with no options there is no listbox.
      const cmp = fixture.componentInstance;
      cmp.suggestions = [];
      cmp.suggestionsError = "Suggestions unavailable";
      await fixture.whenStable();
      expect(root.querySelector('[role="listbox"]')).toBeNull();
      expect(root.querySelector(".cat-suggestions [role=alert]")?.textContent?.trim()).toBe(
        "Suggestions unavailable",
      );
      expect(queryInput(fixture).getAttribute("aria-expanded")).toBe("false");
      expect(queryInput(fixture).hasAttribute("aria-controls")).toBe(false);

      cmp.suggestionsError = null;
      await fixture.whenStable();
      expect(root.querySelector(".cat-suggestions")?.textContent).toContain("No suggestions");
      expect(liveRegion(fixture).textContent?.trim()).toBe("No suggestions");
      expect(root.querySelector('[role="listbox"]')).toBeNull();
    });

    it("options are not tabbable", async () => {
      const fixture = await renderWithSuggestions();
      const options = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="option"]'),
      );

      expect(options).toHaveLength(2);
      for (const option of options) {
        expect(option.tagName).toBe("LI");
        expect(option.tabIndex).toBeLessThan(0);
        expect(option.querySelector("button, a, input, [tabindex]")).toBeNull();
      }
    });

    it("puts combobox state only on an input that is a combobox", async () => {
      const fixture = await renderWithSuggestions({ enableAutocomplete: false });
      const input = queryInput(fixture);

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

    it("keeps the recording timer out of any live region", async () => {
      const fixture = await render();
      const cmp = fixture.componentInstance;
      cmp.isRecording = true;
      await fixture.whenStable();

      const timer = (fixture.nativeElement as HTMLElement).querySelector(".cat-voice-banner__timer")!;
      expect(timer.getAttribute("role")).toBe("timer");
      expect(timer.closest("[aria-live]:not([aria-live=off])")).toBeNull();
      expect(timer.closest("[role=status], [role=alert]")).toBeNull();
    });
  });

  describe("results render after a resolved search", () => {
    it("results render after a resolved text search", async () => {
      const api = createApi({ search: vi.fn().mockResolvedValue(searchResult()) });
      const fixture = await render(api);

      // Typing without autocomplete runs the debounced search (a plain setTimeout).
      typeQuery(fixture, "running shoes");
      await vi.waitFor(() => {
        expect(fixture.nativeElement.querySelector(".cat-status")?.textContent).toContain("Searching");
      });

      await vi.waitFor(() => expect(cards(fixture)).toEqual(["Running Shoe"]));
      expect(fixture.nativeElement.querySelector(".cat-status")).toBeNull();
      expect(api.search).toHaveBeenCalledTimes(1);
      expect(api.search).toHaveBeenCalledWith(
        "/api/commerce-ai",
        "running shoes",
        expect.anything(),
        expect.any(AbortSignal),
        expect.objectContaining({ includeFacets: false }),
      );
    });

    it("results render after a resolved image search", async () => {
      const api = createApi({
        searchByImage: vi.fn().mockResolvedValue({ ...searchResult(), interpretation: "running shoe" }),
      });
      const fixture = await render(api);

      void run(fixture.componentInstance).runImageSearch(imageFile());

      await vi.waitFor(() => expect(cards(fixture)).toEqual(["Running Shoe"]));
      expect(fixture.nativeElement.querySelector(".cat-status")).toBeNull();
      expect(api.searchByImage).toHaveBeenCalledWith(
        "/api/commerce-ai",
        expect.any(File),
        expect.anything(),
        false,
        expect.any(AbortSignal),
      );
      await vi.waitFor(() => expect(queryInput(fixture).value).toBe("running shoe"));
    });

    it("results render after a resolved voice search", async () => {
      const mic = installMicrophone();
      const api = createApi({
        searchByVoice: vi.fn().mockResolvedValue({
          transcript: "running shoes",
          products: [shoe],
          meta,
          ttsPending: false,
        }),
      });
      const fixture = await render(api);

      clickByLabel(fixture, "Voice search");
      await vi.waitFor(() => expect(fixture.nativeElement.querySelector(".cat-voice-banner")).not.toBeNull());
      clickByLabel(fixture, "Stop recording");

      await vi.waitFor(() => expect(cards(fixture)).toEqual(["Running Shoe"]));
      expect(queryInput(fixture).value).toBe("running shoes");
      expect(fixture.nativeElement.querySelector(".cat-voice-banner")).toBeNull();
      const [, audio, , , , signal] = api.searchByVoice.mock.calls[0]!;
      expect((audio as Blob).type).toBe("audio/webm;codecs=opus");
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(mic.track.stop).toHaveBeenCalled();
    });
  });

  it("a slower image search does not overwrite a newer text search", async () => {
    const slowImage = deferred<SearchResult & { interpretation?: string }>();
    const api = createApi({
      searchByImage: vi.fn(() => slowImage.promise),
      search: vi.fn().mockResolvedValue(searchResult([boot])),
    });
    const fixture = await render(api);

    void run(fixture.componentInstance).runImageSearch(imageFile());
    const imageSignal = api.searchByImage.mock.calls[0]![4] as AbortSignal;
    fixture.componentInstance.query = "winter boots";
    await run(fixture.componentInstance).runSubmit();
    await vi.waitFor(() => expect(cards(fixture)).toEqual(["Winter Boot"]));
    expect(imageSignal.aborted).toBe(true);

    slowImage.resolve({ ...searchResult([shoe]), interpretation: "running shoe" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fixture.whenStable();

    expect(cards(fixture)).toEqual(["Winter Boot"]);
    expect(queryInput(fixture).value).toBe("winter boots");
  });

  it("a newer image search supersedes an earlier one", async () => {
    const first = deferred<SearchResult & { interpretation?: string }>();
    const api = createApi({
      searchByImage: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce({ ...searchResult([boot]), interpretation: "winter boot" }),
    });
    const fixture = await render(api);

    void run(fixture.componentInstance).runImageSearch(imageFile());
    await run(fixture.componentInstance).runImageSearch(imageFile());
    first.resolve({ ...searchResult([shoe]), interpretation: "running shoe" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fixture.whenStable();

    expect(cards(fixture)).toEqual(["Winter Boot"]);
  });

  it("shows no error for an image search that was aborted by a reset", async () => {
    const api = createApi({
      searchByImage: vi.fn((_url, _file, _locales, _missions, signal: AbortSignal) =>
        abortable<SearchResult>(signal).promise,
      ),
    });
    const fixture = await render(api);
    const cmp = fixture.componentInstance;

    void run(cmp).runImageSearch(imageFile());
    cmp.onQueryChange("a");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fixture.whenStable();

    expect(cmp.error).toBeNull();
    expect(cmp.isLoading).toBe(false);
    expect(cmp.hasSearched).toBe(false);
    expect(fixture.nativeElement.querySelector(".cat-status--error")).toBeNull();
  });

  it("shows a localized message for a failed image search, not the server text", async () => {
    const api = createApi({
      searchByImage: vi
        .fn()
        .mockRejectedValue(new CommerceAIApiError({ status: 500, code: "INTERNAL", message: "vision model exploded" })),
    });
    const fixture = await render(api, { messages: { imageSearchFailed: "Obrazu nie udało się wyszukać" } });
    fixture.componentInstance.query = "shoe";

    await run(fixture.componentInstance).runImageSearch(imageFile());
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector(".cat-status--error")?.textContent).toContain(
      "Obrazu nie udało się wyszukać",
    );
    expect(fixture.nativeElement.textContent).not.toContain("vision model exploded");
  });

  it("aborts an in-flight image search on destroy", async () => {
    const api = createApi({ searchByImage: vi.fn(() => new Promise<SearchResult>(() => undefined)) });
    const fixture = await render(api);

    void run(fixture.componentInstance).runImageSearch(imageFile());
    const signal = api.searchByImage.mock.calls[0]![4] as AbortSignal;
    fixture.destroy();

    expect(signal.aborted).toBe(true);
  });

  it("resets the image input so the same file can be chosen again", async () => {
    const api = createApi({ searchByImage: vi.fn().mockResolvedValue(searchResult()) });
    const fixture = await render(api);
    const file = imageFile();
    const input = { files: [file], value: "C:\\fakepath\\shoe.png" };

    fixture.componentInstance.onFileSelected({ target: input } as unknown as Event);

    expect(input.value).toBe("");
    expect(api.searchByImage).toHaveBeenCalledWith(
      "/api/commerce-ai",
      file,
      expect.anything(),
      false,
      expect.any(AbortSignal),
    );
  });

  describe("submit and suggestions", () => {
    it("submit cancels the pending suggestions request", async () => {
      const suggestions = deferred<{ suggestions: string[] }>();
      const api = createApi({
        suggest: vi.fn(() => suggestions.promise),
        search: vi.fn().mockResolvedValue(searchResult()),
      });
      const fixture = await render(api, { enableAutocomplete: true });
      const cmp = fixture.componentInstance;

      typeQuery(fixture, "red shoes");
      await vi.waitFor(() => expect(api.suggest).toHaveBeenCalledTimes(1));
      const suggestSignal = api.suggest.mock.calls[0]![3] as AbortSignal;

      await run(cmp).runSubmit();
      expect(suggestSignal.aborted).toBe(true);

      // Even if the aborted request still resolves, its suggestions must not show.
      suggestions.resolve({ suggestions: ["Red Shoes Sale"] });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(cmp.suggestions).toEqual([]);
      expect(cmp.isLoadingSuggestions).toBe(false);
    });

    it("submit before the suggestions debounce fires never requests suggestions", async () => {
      const api = createApi({ suggest: vi.fn(), search: vi.fn().mockResolvedValue(searchResult()) });
      const fixture = await render(api, { enableAutocomplete: true });

      typeQuery(fixture, "red shoes");
      await run(fixture.componentInstance).runSubmit();
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(api.suggest).not.toHaveBeenCalled();
      expect(api.search).toHaveBeenCalledTimes(1);
    });

    it("submit before the search debounce fires runs one search, not two", async () => {
      const api = createApi({ search: vi.fn().mockResolvedValue(searchResult()) });
      const fixture = await render(api);

      typeQuery(fixture, "running shoes");
      await run(fixture.componentInstance).runSubmit();
      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(api.search).toHaveBeenCalledTimes(1);
    });

    it("localizes a failed suggestions request", async () => {
      const api = createApi({
        suggest: vi
          .fn()
          .mockRejectedValue(new CommerceAIApiError({ status: 429, code: "RATE_LIMITED", message: "slow down" })),
      });
      const fixture = await render(api, { enableAutocomplete: true });

      typeQuery(fixture, "red");

      await vi.waitFor(() => {
        expect(fixture.nativeElement.querySelector(".cat-suggestions__status--error")?.textContent).toContain(
          DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.rateLimited,
        );
      });
    });
  });

  it("renders grouped mission results and hides the flat grid", async () => {
    const mission: MissionSearchResult = {
      interpretation: "racket and balls",
      intents: [
        {
          intent: { id: "intent-0", label: "racket", quantity: 1, searchTerms: ["racket"] },
          products: [{ id: "p1", name: "Pro Racket", sku: "RACKET-1" }],
          total: 1,
        },
        {
          intent: { id: "intent-1", label: "balls", quantity: 2, searchTerms: ["balls"] },
          products: [{ id: "p3", name: "Tour Balls", sku: "BALL-1" }],
          total: 1,
        },
      ],
    };
    const api = createApi({
      search: vi.fn().mockResolvedValue({
        products: [{ id: "p1", name: "Pro Racket", sku: "RACKET-1" }],
        meta: { ...meta, searchTerms: ["racket", "balls"], queryInterpretation: "racket and balls" },
        mission,
      }),
    });
    const fixture = await render(api, { enableMissions: true, enableFacets: true });
    fixture.componentInstance.query = "racket and balls";

    await run(fixture.componentInstance).runSubmit();
    await fixture.whenStable();

    expect(api.search).toHaveBeenCalledWith(
      "/api/commerce-ai",
      "racket and balls",
      expect.anything(),
      expect.any(AbortSignal),
      expect.objectContaining({ enableMissions: true }),
    );
    expect(fixture.componentInstance.mission?.intents).toHaveLength(2);
    expect(fixture.componentInstance.hasFacetSession).toBe(false);
    expect(fixture.nativeElement.querySelector(".cat-mission")).not.toBeNull();
    expect(fixture.nativeElement.querySelector(".cat-results")).toBeNull();
    expect(fixture.nativeElement.querySelector(".cat-root--mission-lanes-2")).not.toBeNull();
  });

  it("renders flat results as a list with a featured first card", async () => {
    const fixture = await render();
    const cmp = fixture.componentInstance;
    cmp.query = "racket";
    cmp.hasSearched = true;
    cmp.addedProductIds = { p1: true };
    cmp.results = [
      { id: "p1", name: "Pro Racket", sku: "RACKET-1" },
      { id: "p2", name: "Club Racket", sku: "RACKET-2" },
    ];
    await fixture.whenStable();

    const list = fixture.nativeElement.querySelector(".cat-results");
    expect(list?.getAttribute("role")).toBe("list");
    expect(list?.getAttribute("aria-label")).toBe(cmp.resolvedMessages.searchResultsAriaLabel);
    const items = Array.from(
      fixture.nativeElement.querySelectorAll(".cat-results .cat-result-card"),
    ) as HTMLElement[];
    expect(items).toHaveLength(2);
    expect(items.every((card) => card.getAttribute("role") === "listitem")).toBe(true);
    expect(items[0]?.className).toContain("cat-result-card--featured");
    expect(items[1]?.className).not.toContain("cat-result-card--featured");
  });

  it("marks the flat add button as added without the cart panel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ cart: null }) }));
    const fixture = await render(createApi(), { enableCart: true });
    const cmp = fixture.componentInstance;
    cmp.query = "racket";
    cmp.hasSearched = true;
    cmp.addedProductIds = { p1: true };
    cmp.results = [{ id: "p1", name: "Pro Racket", sku: "RACKET-1" }];
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector(".cat-result-card__add--added")).not.toBeNull();
  });

  it("shows the added state after an add to cart and clears it after the timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ cart: null }) }));
    const fixture = await render(createApi(), { enableCart: true });
    const cmp = fixture.componentInstance;
    cmp.query = "racket";
    cmp.hasSearched = true;
    cmp.results = [{ id: "p1", name: "Pro Racket", sku: "RACKET-1" }];
    vi.spyOn(cmp.cart, "addToCart").mockResolvedValue({ id: "cart-1" } as never);
    await fixture.whenStable();

    cmp.onAddItem({ id: "p1", name: "Pro Racket", sku: "RACKET-1" });
    await vi.waitFor(() =>
      expect(fixture.nativeElement.querySelector(".cat-result-card__add--added")).not.toBeNull(),
    );
    await vi.waitFor(
      () => expect(fixture.nativeElement.querySelector(".cat-result-card__add--added")).toBeNull(),
      { timeout: 3000 },
    );
  });

  it("skips the added-state update when destroyed during add-to-cart", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ cart: null }) }));
    const fixture = await render();

    const pending = deferred<unknown>();
    vi.spyOn(fixture.componentInstance.cart, "addToCart").mockReturnValue(pending.promise as never);
    fixture.componentInstance.onAddItem({ id: "p1", name: "Pro Racket", sku: "RACKET-1" });
    fixture.destroy();
    pending.resolve({ id: "cart-1" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fixture.componentInstance.addedProductIds).toEqual({});
  });

  it("hides add-to-cart controls when enableCart is false", async () => {
    const fixture = await render(createApi(), { enableCart: false, enableMissions: true });
    const cmp = fixture.componentInstance;
    cmp.query = "racket and balls";
    cmp.hasSearched = true;
    cmp.mission = {
      interpretation: "racket and balls",
      intents: [
        {
          intent: { id: "intent-0", label: "racket", quantity: 1, searchTerms: ["racket"] },
          products: [{ id: "p1", name: "Pro Racket", sku: "RACKET-1" }],
          total: 1,
        },
        {
          intent: { id: "intent-1", label: "balls", quantity: 1, searchTerms: ["balls"] },
          products: [{ id: "p3", name: "Tour Balls", sku: "BALL-1" }],
          total: 1,
        },
      ],
    };
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector(".cat-cart-toggle")).toBeNull();
    expect(fixture.nativeElement.querySelector(".cat-mission__add-all")).toBeNull();
    expect(fixture.nativeElement.querySelector(".cat-result-card__add")).toBeNull();
  });

  it("renders the search shell and action cluster", async () => {
    const fixture = await render();

    expect(fixture.nativeElement.querySelector(".cat-search-shell")).not.toBeNull();
    expect(fixture.nativeElement.querySelector(".cat-search-actions")).not.toBeNull();
    expect(fixture.nativeElement.querySelector(".cat-search-bar--voice-active")).toBeNull();
  });

  it("shows the voice banner while recording", async () => {
    const fixture = await render();
    fixture.componentInstance.isRecording = true;
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector(".cat-search-bar--voice-active")).not.toBeNull();
    expect(fixture.nativeElement.querySelector(".cat-voice-banner")?.textContent).toContain("Listening…");
  });

  it("filters facets by suggested names and uses the new-search action class", async () => {
    const fixture = await render(createApi(), { enableFacets: true });
    const cmp = fixture.componentInstance;
    cmp.lastSearchMode = "text";
    cmp.hasSearched = true;
    cmp.query = "red shoes";
    cmp.facets = [
      { id: "color", label: "Color", type: "distinct", buckets: [{ key: "red", label: "Red", count: 4 }] },
      { id: "size", label: "Size", type: "distinct", buckets: [{ key: "42", label: "42", count: 2 }] },
    ];
    cmp.suggestedFacets = [{ name: "color" }];
    await fixture.whenStable();

    expect(cmp.visibleFacets.map((facet) => facet.id)).toEqual(["color"]);
    expect(fixture.nativeElement.querySelector(".cat-facets__new")).not.toBeNull();
    expect(fixture.nativeElement.querySelector(".cat-facet-chip__count")?.textContent).toBe("4");
    expect(fixture.nativeElement.querySelector('[aria-label="Size"]')).toBeNull();
  });

  it("reads price chip selection with the facet group currency", async () => {
    const fixture = await render();
    fixture.componentInstance.meta = { ...meta, appliedFilters: { priceMax: "5000" } };

    expect(fixture.componentInstance.isFacetSelected("price", "under-50", "JPY")).toBe(true);
    expect(fixture.componentInstance.isFacetSelected("price", "under-50")).toBe(false);
  });

  describe("facetSelections", () => {
    const facets: SearchFacetGroup[] = [
      {
        id: "color",
        label: "Color",
        type: "distinct",
        buckets: [
          { key: "red", label: "Red", count: 3 },
          { key: "blue", label: "Blue", count: 2 },
        ],
      },
      { id: "size", label: "Size", type: "distinct", buckets: [{ key: "M", label: "M", count: 4 }] },
      {
        id: "categories",
        label: "Category",
        type: "distinct",
        buckets: [{ key: "cat-1", label: "Shoes", count: 5 }],
      },
    ];

    /** A facet session whose appliedFilters echo what the model derived from "red shoes". */
    const echoed = (filters: Record<string, string> = { color: "red" }) =>
      searchResult([shoe], {
        meta: {
          ...meta,
          queryInterpretation: "red shoes",
          searchTerms: ["shoes"],
          appliedFilters: filters,
        },
        facets,
        suggestedFacets: [{ name: "color" }, { name: "size" }],
      });

    const options = (api: Api, call: number) => api.search.mock.calls[call]![4] as Record<string, unknown>;

    async function renderSession(api: Api) {
      const fixture = await render(api, { enableFacets: true });
      fixture.componentInstance.query = "red shoes";
      await run(fixture.componentInstance).runSubmit();
      return fixture;
    }

    it("sends no facetSelections for a model constraint, only for clicked chip groups", async () => {
      const api = createApi({
        search: vi
          .fn()
          .mockResolvedValueOnce(echoed({ color: "red" }))
          .mockResolvedValueOnce(echoed({ color: "red" }))
          .mockResolvedValueOnce(echoed({ color: "red", size: "M" }))
          .mockResolvedValue(echoed({ color: "red", size: "M" })),
      });
      const fixture = await renderSession(api);
      const cmp = fixture.componentInstance;

      // A text refinement of a session whose only filter was echoed by the model.
      cmp.query = "red shoes cheap";
      await run(cmp).runSubmit();
      expect(options(api, 1)).not.toHaveProperty("facetSelections");
      expect(options(api, 1)).toMatchObject({ refineQuery: "red shoes cheap", filters: { color: "red" } });

      // A size chip: only size is a clicked group (color stays a model constraint).
      await run(cmp).runToggleFacet("size", "M");
      expect(options(api, 2).facetSelections).toEqual({ size: ["M"] });

      // A later text refinement keeps the clicked chip.
      cmp.query = "red shoes cheap leather";
      await run(cmp).runSubmit();
      expect(options(api, 3).facetSelections).toEqual({ size: ["M"] });
    });

    it("lists every clicked group still selected, categories included", async () => {
      const api = createApi({
        search: vi
          .fn()
          .mockResolvedValueOnce(echoed({}))
          .mockResolvedValueOnce(echoed({ size: "M" }))
          .mockResolvedValueOnce(echoed({ size: "M", category: "cat-1" }))
          .mockResolvedValue(echoed({ category: "cat-1" })),
      });
      const fixture = await renderSession(api);
      const cmp = fixture.componentInstance;

      await run(cmp).runToggleFacet("size", "M");
      expect(options(api, 1).facetSelections).toEqual({ size: ["M"] });
      await run(cmp).runToggleFacet("categories", "cat-1");
      expect(options(api, 2).facetSelections).toEqual({ size: ["M"], categories: ["cat-1"] });
      await run(cmp).runToggleFacet("size", "M");
      expect(options(api, 3).facetSelections).toEqual({ categories: ["cat-1"] });
    });

    it("omits the field when the last chip is cleared", async () => {
      const api = createApi({
        search: vi
          .fn()
          .mockResolvedValueOnce(echoed({}))
          .mockResolvedValueOnce(echoed({ size: "M" }))
          .mockResolvedValue(echoed({})),
      });
      const fixture = await renderSession(api);

      await run(fixture.componentInstance).runToggleFacet("size", "M");
      await run(fixture.componentInstance).runClearFacetFilters();

      expect(options(api, 2)).not.toHaveProperty("facetSelections");
    });

    it("forgets clicked chips when a new search starts", async () => {
      const api = createApi({
        search: vi
          .fn()
          .mockResolvedValueOnce(echoed({}))
          .mockResolvedValueOnce(echoed({ size: "M" }))
          .mockResolvedValueOnce(echoed({ size: "M" }))
          .mockResolvedValue(echoed({ size: "M" })),
        searchByImage: vi.fn().mockResolvedValue(echoed({ size: "M" })),
      });
      const fixture = await renderSession(api);
      const cmp = fixture.componentInstance;

      await run(cmp).runToggleFacet("size", "M");
      expect(options(api, 1).facetSelections).toEqual({ size: ["M"] });

      await run(cmp).runStartNewSearch();
      cmp.query = "blue shoes";
      await run(cmp).runSubmit();
      expect(options(api, 3)).not.toHaveProperty("facetSelections");

      await run(cmp).runToggleFacet("size", "M");
      await run(cmp).runImageSearch(imageFile());
      cmp.query = "blue shoes";
      await run(cmp).runSubmit();
      expect(options(api, 4)).not.toHaveProperty("facetSelections");
    });

    it("a superseded refinement does not touch the clicked chips", async () => {
      const slowChip = deferred<SearchResult>();
      const api = createApi({
        search: vi
          .fn()
          .mockResolvedValueOnce(echoed({}))
          .mockReturnValueOnce(slowChip.promise)
          .mockResolvedValue(echoed({})),
        searchByImage: vi.fn().mockResolvedValue(echoed({ color: "red" })),
      });
      const fixture = await renderSession(api);
      const cmp = fixture.componentInstance;

      const chip = run(cmp).runToggleFacet("size", "M");
      await run(cmp).runImageSearch(imageFile());
      slowChip.resolve(echoed({ size: "M" }));
      await chip;

      cmp.query = "blue shoes";
      await run(cmp).runSubmit();
      expect(options(api, 2)).not.toHaveProperty("facetSelections");
      expect(options(api, 2)).toMatchObject({ refineQuery: "blue shoes" });
    });
  });

  describe("2.x public members", () => {
    it("exposes state as plain values, readable and assignable like the 2.x fields", async () => {
      const fixture = await render(createApi(), { messages: { searching: "Looking..." } });
      const cmp = fixture.componentInstance;

      // Type-level: these assignments fail to compile if a member becomes a signal.
      const results: ProductCard[] = cmp.results;
      const query: string = cmp.query;
      const isLoading: boolean = cmp.isLoading;
      const error: string | null = cmp.error;
      const meta: { queryInterpretation?: string; searchTerms?: string[] } | null = cmp.meta;
      const showResults: boolean = cmp.showResults;
      const searching: string = cmp.resolvedMessages.searching;
      expect([results, query, isLoading, error, meta, showResults, searching]).toEqual([
        [],
        "",
        false,
        null,
        null,
        false,
        "Looking...",
      ]);

      cmp.query = "shoes";
      cmp.results = [shoe];
      cmp.hasSearched = true;
      await fixture.whenStable();

      expect(cmp.query).toBe("shoes");
      expect(Array.isArray(cmp.results)).toBe(true);
      expect(cmp.showResults).toBe(true);
      expect(queryInput(fixture).value).toBe("shoes");
      expect(cards(fixture)).toEqual(["Running Shoe"]);
    });

    it("offers a replay for the inline spoken summary and no longer exposes audioSummary", async () => {
      installMicrophone();
      const base64 = btoa("mp3-bytes");
      const api = createApi({
        searchByVoice: vi.fn().mockResolvedValue({
          transcript: "running shoes",
          products: [shoe],
          meta,
          audioSummary: base64,
          ttsPending: false,
        }),
      });
      const fixture = await render(api);

      clickByLabel(fixture, "Voice search");
      await vi.waitFor(() => expect(fixture.nativeElement.querySelector(".cat-voice-banner")).not.toBeNull());
      clickByLabel(fixture, "Stop recording");

      await vi.waitFor(() => expect(fixture.componentInstance.showVoiceReplay).toBe(true));
      expect("audioSummary" in fixture.componentInstance).toBe(false);
    });

    it("offers a replay for a clip fetched from the tts route", async () => {
      installMicrophone();
      const api = createApi({
        searchByVoice: vi.fn().mockResolvedValue({
          transcript: "running shoes",
          products: [shoe],
          meta,
          ttsText: "Found one pair",
          ttsPending: true,
        }),
        synthesizeSpeech: vi.fn().mockResolvedValue(new Blob(["abc"], { type: "audio/mpeg" })),
      });
      const fixture = await render(api);

      clickByLabel(fixture, "Voice search");
      await vi.waitFor(() => expect(fixture.nativeElement.querySelector(".cat-voice-banner")).not.toBeNull());
      clickByLabel(fixture, "Stop recording");

      await vi.waitFor(() => expect(fixture.componentInstance.showVoiceReplay).toBe(true));
    });

    it("ngOnDestroy releases the microphone when a host calls it directly", async () => {
      const mic = installMicrophone();
      const fixture = await render();

      clickByLabel(fixture, "Voice search");
      await vi.waitFor(() => expect(mic.recorders).toHaveLength(1));
      fixture.componentInstance.ngOnDestroy();

      expect(mic.track.stop).toHaveBeenCalled();
      expect(mic.recorders[0]!.state).toBe("inactive");
    });
  });

  describe("camera", () => {
    it("shows the preview with the stream and releases it on destroy", async () => {
      const mic = installMicrophone();
      const fixture = await render();

      void fixture.componentInstance.openCameraOverlay();

      await vi.waitFor(() => {
        expect(fixture.nativeElement.querySelector("video.cat-camera-preview")).not.toBeNull();
      });
      const video = fixture.nativeElement.querySelector("video") as HTMLVideoElement;
      await vi.waitFor(() => expect(video.srcObject).not.toBeNull());

      fixture.destroy();
      expect(mic.track.stop).toHaveBeenCalled();
    });

    it("releases a camera stream that arrives after the widget was destroyed", async () => {
      const mic = installMicrophone({ manual: true });
      const fixture = await render();

      void fixture.componentInstance.openCameraOverlay();
      await vi.waitFor(() => expect(mic.getUserMedia).toHaveBeenCalled());
      fixture.destroy();
      mic.grant();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mic.track.stop).toHaveBeenCalled();
      expect(fixture.componentInstance.isCameraOpen).toBe(false);
    });

    it("closing the camera while the permission prompt is open does not open the overlay", async () => {
      const mic = installMicrophone({ manual: true });
      const fixture = await render();
      const cmp = fixture.componentInstance;

      void cmp.openCameraOverlay();
      await vi.waitFor(() => expect(mic.getUserMedia).toHaveBeenCalled());
      cmp.closeCamera();
      mic.grant();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await fixture.whenStable();

      expect(cmp.isCameraOpen).toBe(false);
      expect(mic.track.stop).toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector(".cat-camera-overlay")).toBeNull();
    });

    describe("modal dialog", () => {
      const showModal = vi.fn(function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      });
      const close = vi.fn(function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      });

      beforeEach(() => {
        // jsdom has HTMLDialogElement but not showModal() / close().
        Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModal });
        Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: close });
        showModal.mockClear();
        close.mockClear();
      });

      afterEach(() => {
        Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
        Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
        document.body.replaceChildren();
      });

      async function openFromButton() {
        const mic = installMicrophone();
        const fixture = await render();
        document.body.append(fixture.nativeElement);
        const trigger = (fixture.nativeElement as HTMLElement).querySelector(
          '[aria-label="Search by camera"]',
        ) as HTMLButtonElement;
        trigger.focus();
        trigger.click();
        await vi.waitFor(() => {
          expect(fixture.nativeElement.querySelector("dialog.cat-camera-overlay")).not.toBeNull();
        });
        return { fixture, mic, trigger };
      }

      it("opens the camera as a modal <dialog> and returns focus to the camera button on cancel", async () => {
        const { fixture, mic, trigger } = await openFromButton();
        const dialog = fixture.nativeElement.querySelector("dialog") as HTMLDialogElement;

        expect(showModal).toHaveBeenCalledTimes(1);
        expect(dialog.getAttribute("aria-modal")).toBe("true");
        expect(dialog.getAttribute("aria-label")).toBe(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.cameraCapture);

        (dialog.querySelector('[aria-label="Cancel"]') as HTMLButtonElement).focus();
        (dialog.querySelector('[aria-label="Cancel"]') as HTMLButtonElement).click();

        await vi.waitFor(() => expect(fixture.nativeElement.querySelector("dialog")).toBeNull());
        expect(mic.track.stop).toHaveBeenCalled();
        expect(document.activeElement).toBe(trigger);
      });

      it("closes on Escape, stops the stream and returns focus to the camera button", async () => {
        const { fixture, mic, trigger } = await openFromButton();
        const dialog = fixture.nativeElement.querySelector("dialog") as HTMLDialogElement;

        const escape = new Event("cancel", { cancelable: true });
        dialog.dispatchEvent(escape);

        await vi.waitFor(() => expect(fixture.nativeElement.querySelector("dialog")).toBeNull());
        expect(escape.defaultPrevented).toBe(true);
        expect(mic.track.stop).toHaveBeenCalled();
        expect(document.activeElement).toBe(trigger);
      });

      it("dismisses a camera error on Escape and returns focus to the camera button", async () => {
        installMicrophone({ reject: new DOMException("denied", "NotAllowedError") });
        const fixture = await render();
        document.body.append(fixture.nativeElement);
        const trigger = (fixture.nativeElement as HTMLElement).querySelector(
          '[aria-label="Search by camera"]',
        ) as HTMLButtonElement;
        trigger.focus();
        trigger.click();
        await vi.waitFor(() => expect(fixture.nativeElement.querySelector("dialog [role=alert]")).not.toBeNull());

        fixture.nativeElement.querySelector("dialog").dispatchEvent(new Event("cancel", { cancelable: true }));

        await vi.waitFor(() => expect(fixture.nativeElement.querySelector("dialog")).toBeNull());
        expect(fixture.componentInstance.cameraError).toBeNull();
        expect(document.activeElement).toBe(trigger);
      });
    });

    it("shows a localized message when the camera is refused", async () => {
      installMicrophone({ reject: new DOMException("denied", "NotAllowedError") });
      const fixture = await render();

      await fixture.componentInstance.openCameraOverlay();

      await vi.waitFor(() => {
        expect(fixture.nativeElement.querySelector(".cat-camera-overlay__error")?.textContent).toContain(
          DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.cameraDenied,
        );
      });
    });
  });

  describe("React parity (UX-08, NG-10)", () => {
    const EMOJI = /\p{Extended_Pictographic}/u;

    async function renderWithResults() {
      const fixture = await render(createApi(), { enableCart: true, enableAutocomplete: true });
      const cmp = fixture.componentInstance;
      cmp.query = "shoes";
      cmp.hasSearched = true;
      cmp.results = [{ id: "p1", name: "Shoe", slug: "shoe", sku: "S-1" }];
      await fixture.whenStable();
      return fixture;
    }

    it("hides every decorative icon from assistive technology", async () => {
      const fixture = await renderWithResults();
      fixture.componentInstance.cart.isCartOpen.set(true);
      await fixture.whenStable();

      const icons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll("svg"));
      expect(icons.length).toBeGreaterThan(5);
      // Hidden itself or through a decorative wrapper.
      expect(icons.filter((icon) => !icon.closest('[aria-hidden="true"]'))).toEqual([]);
    });

    it("uses no emoji in text or accessible names, also for a product without an image", async () => {
      const fixture = await renderWithResults();
      const root = fixture.nativeElement as HTMLElement;

      expect(root.querySelector(".cat-result-image--placeholder svg")).not.toBeNull();
      expect(EMOJI.test(root.textContent ?? "")).toBe(false);
      const names = Array.from(root.querySelectorAll("[aria-label]")).map((el) => el.getAttribute("aria-label"));
      expect(names.some((name) => EMOJI.test(name ?? ""))).toBe(false);
    });

    it("exposes the cart disclosure with aria-expanded only", async () => {
      const fixture = await renderWithResults();
      const toggle = (fixture.nativeElement as HTMLElement).querySelector(".cat-cart-toggle") as HTMLElement;

      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(toggle.hasAttribute("aria-pressed")).toBe(false);

      toggle.click();
      await fixture.whenStable();
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
    });

    it("returns focus to the cart toggle when the cart closes", async () => {
      const fixture = await renderWithResults();
      const root = fixture.nativeElement as HTMLElement;
      document.body.append(root);
      const toggle = root.querySelector(".cat-cart-toggle") as HTMLButtonElement;
      toggle.focus();
      toggle.click();
      await fixture.whenStable();
      const closeButton = root.querySelector(".cat-cart-panel__header button") as HTMLButtonElement;
      closeButton.focus();

      closeButton.click();
      await fixture.whenStable();

      expect(root.querySelector(".cat-cart-panel")).toBeNull();
      expect(document.activeElement).toBe(toggle);
      root.remove();
    });

    it("lets a host assign cameraInputRef and cameraVideoRef like in 2.x", async () => {
      const fixture = await render();
      const cmp = fixture.componentInstance;
      const fromView = cmp.cameraInputRef;
      expect(fromView?.nativeElement).toBeInstanceOf(HTMLInputElement);

      const input = new ElementRef(document.createElement("input"));
      const video = new ElementRef(document.createElement("video"));
      cmp.cameraInputRef = input;
      cmp.cameraVideoRef = video;

      expect(cmp.cameraInputRef).toBe(input);
      expect(cmp.cameraVideoRef).toBe(video);

      cmp.cameraInputRef = undefined;
      expect(cmp.cameraInputRef).toBe(fromView);
      expect(cmp.cameraVideoRef).toBe(video);
    });

    it("tears the store down once when the widget is destroyed", async () => {
      const fixture = await render();
      const store = (fixture.componentInstance as unknown as { store: CommerceAiSearchStore }).store;
      const teardown = vi.spyOn(store, "teardown");

      fixture.destroy();

      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it("ignores a dropped or picked file that is not an image", async () => {
      const api = createApi();
      const fixture = await render(api);
      const text = new File(["x"], "notes.txt", { type: "text/plain" });
      const input = { files: [text], value: "x" } as unknown as HTMLInputElement;

      fixture.componentInstance.onFileSelected({ target: input } as unknown as Event);
      fixture.componentInstance.onDrop({
        preventDefault() {},
        dataTransfer: { files: [text] },
      } as unknown as DragEvent);
      await fixture.whenStable();

      expect(api.searchByImage).not.toHaveBeenCalled();
      expect(fixture.componentInstance.isLoading).toBe(false);
    });
  });

  describe("voice", () => {
    it("destroy stops the microphone stream and recorder", async () => {
      const mic = installMicrophone();
      const api = createApi({ searchByVoice: vi.fn() });
      const fixture = await render(api);

      clickByLabel(fixture, "Voice search");
      await vi.waitFor(() => expect(mic.recorders).toHaveLength(1));
      const recorder = mic.recorders[0]!;
      expect(recorder.state).toBe("recording");

      fixture.destroy();

      expect(mic.track.stop).toHaveBeenCalled();
      expect(recorder.state).toBe("inactive");
      expect(recorder.onstop).toBeNull();
      expect(recorder.ondataavailable).toBeNull();
      // Nothing may be uploaded for a widget that is gone.
      expect(api.searchByVoice).not.toHaveBeenCalled();
    });

    it("destroy releases a stream that arrives after the widget was destroyed", async () => {
      const mic = installMicrophone({ manual: true });
      const fixture = await render();

      clickByLabel(fixture, "Voice search");
      await vi.waitFor(() => expect(mic.getUserMedia).toHaveBeenCalled());
      fixture.destroy();
      mic.grant();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mic.track.stop).toHaveBeenCalled();
      expect(mic.recorders).toHaveLength(0);
    });

    it("destroy aborts the in-flight voice request and shows no error", async () => {
      installMicrophone();
      const api = createApi({
        searchByVoice: vi.fn((_u, _b, _l, _t, _m, signal: AbortSignal) => abortable(signal).promise),
      });
      const fixture = await render(api);

      clickByLabel(fixture, "Voice search");
      await vi.waitFor(() => expect(fixture.nativeElement.querySelector(".cat-voice-banner")).not.toBeNull());
      clickByLabel(fixture, "Stop recording");
      await vi.waitFor(() => expect(api.searchByVoice).toHaveBeenCalled());
      const signal = api.searchByVoice.mock.calls[0]![5] as AbortSignal;
      fixture.destroy();

      expect(signal.aborted).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(fixture.componentInstance.voiceError).toBeNull();
    });

    it("shows no error for a voice request aborted by a reset", async () => {
      installMicrophone();
      const api = createApi({
        searchByVoice: vi.fn((_u, _b, _l, _t, _m, signal: AbortSignal) => abortable(signal).promise),
      });
      const fixture = await render(api);
      const cmp = fixture.componentInstance;

      clickByLabel(fixture, "Voice search");
      await vi.waitFor(() => expect(fixture.nativeElement.querySelector(".cat-voice-banner")).not.toBeNull());
      clickByLabel(fixture, "Stop recording");
      await vi.waitFor(() => expect(api.searchByVoice).toHaveBeenCalled());

      cmp.onQueryChange("a");
      await vi.waitFor(() => expect(cmp.isProcessing).toBe(false));

      expect(cmp.voiceError).toBeNull();
      expect(fixture.nativeElement.querySelector(".cat-voice-banner")).toBeNull();
    });

    it("a slower voice result does not overwrite a newer text search", async () => {
      installMicrophone();
      const slowVoice = deferred<unknown>();
      const api = createApi({
        searchByVoice: vi.fn(() => slowVoice.promise),
        search: vi.fn().mockResolvedValue(searchResult([boot])),
      });
      const fixture = await render(api);
      const cmp = fixture.componentInstance;

      clickByLabel(fixture, "Voice search");
      await vi.waitFor(() => expect(fixture.nativeElement.querySelector(".cat-voice-banner")).not.toBeNull());
      clickByLabel(fixture, "Stop recording");
      await vi.waitFor(() => expect(api.searchByVoice).toHaveBeenCalled());

      cmp.query = "winter boots";
      await run(cmp).runSubmit();
      slowVoice.resolve({ transcript: "running shoes", products: [shoe], meta, ttsPending: false });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await fixture.whenStable();

      expect(cards(fixture)).toEqual(["Winter Boot"]);
      expect(cmp.query).toBe("winter boots");
      expect(cmp.isProcessing).toBe(false);
    });

    it("shows a localized message when the microphone is refused", async () => {
      installMicrophone({ reject: new DOMException("denied", "NotAllowedError") });
      const fixture = await render();

      clickByLabel(fixture, "Voice search");

      await vi.waitFor(() => {
        expect(fixture.nativeElement.querySelector(".cat-voice-banner--error")?.textContent).toContain(
          DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.microphoneDenied,
        );
      });
    });

    it("fetches and offers the spoken summary when the server defers text to speech", async () => {
      installMicrophone();
      installAudioPlayback();
      const api = createApi({
        searchByVoice: vi.fn().mockResolvedValue({
          transcript: "running shoes",
          products: [shoe],
          meta,
          ttsText: "Found one pair",
          ttsPending: true,
        }),
        synthesizeSpeech: vi.fn().mockResolvedValue(new Blob(["mp3"], { type: "audio/mpeg" })),
      });
      const fixture = await render(api);

      clickByLabel(fixture, "Voice search");
      await vi.waitFor(() => expect(fixture.nativeElement.querySelector(".cat-voice-banner")).not.toBeNull());
      clickByLabel(fixture, "Stop recording");

      await vi.waitFor(() => {
        expect(fixture.nativeElement.querySelector(`[aria-label="${DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.replayVoiceSummary}"]`)).not.toBeNull();
      });
      expect(api.synthesizeSpeech).toHaveBeenCalledWith(
        "/api/commerce-ai",
        "Found one pair",
        expect.any(AbortSignal),
      );
    });
  });
});

interface FakeRecorder {
  state: "inactive" | "recording";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start(): void;
  stop(): void;
}

/** Stubs `getUserMedia` and `MediaRecorder`; `stop()` ends the recording like a browser would. */
function installMicrophone(options: { manual?: boolean; reject?: unknown } = {}) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const recorders: FakeRecorder[] = [];
  let grant: () => void = () => undefined;

  class FakeMediaRecorder implements FakeRecorder {
    state: "inactive" | "recording" = "inactive";
    mimeType = "audio/webm;codecs=opus";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;

    constructor() {
      recorders.push(this);
    }

    start(): void {
      this.state = "recording";
    }

    stop(): void {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["audio"]) });
      this.onstop?.();
    }
  }

  const getUserMedia = vi.fn(() => {
    if (options.reject) {
      return Promise.reject(options.reject);
    }
    if (options.manual) {
      return new Promise<MediaStream>((resolve) => {
        grant = () => resolve(stream);
      });
    }
    return Promise.resolve(stream);
  });

  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  // jsdom has no `mediaDevices`; the navigator itself must stay a real Navigator.
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  installAudioPlayback();

  return { track, recorders, getUserMedia, grant: () => grant() };
}

/** jsdom has no media playback and no object URLs. */
function installAudioPlayback(): void {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockReturnValue(undefined);
  URL.createObjectURL = vi.fn(() => "blob:clip");
  URL.revokeObjectURL = vi.fn();
}
