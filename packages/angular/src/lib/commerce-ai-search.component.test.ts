import "zone.js";
import "zone.js/testing";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CommerceAiSearchComponent } from "./commerce-ai-search.component.js";
import { CommerceAiApiService } from "./commerce-ai-api.service.js";

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

describe("CommerceAiSearchComponent", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("merges custom messages with defaults", async () => {
    await TestBed.configureTestingModule({
      imports: [CommerceAiSearchComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CommerceAiSearchComponent);
    fixture.componentInstance.messages = { searching: "Looking up products..." };
    fixture.detectChanges();

    expect(fixture.componentInstance.resolvedMessages.searching).toBe("Looking up products...");
    expect(fixture.componentInstance.resolvedMessages.placeholder).toBe("What are you looking for?");
  });

  it("configures voice, camera, and image upload independently", async () => {
    await TestBed.configureTestingModule({
      imports: [CommerceAiSearchComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CommerceAiSearchComponent);
    fixture.componentInstance.enableVoice = false;
    fixture.componentInstance.enableCameraSearch = true;
    fixture.componentInstance.enableImageSearch = false;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[aria-label="Voice search"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Search by camera"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Search by image"]')).toBeNull();
  });

  it("ignores image drops when image search is disabled", async () => {
    const searchByImage = vi.fn().mockResolvedValue({ products: [] });

    await TestBed.configureTestingModule({
      imports: [CommerceAiSearchComponent],
      providers: [
        {
          provide: CommerceAiApiService,
          useValue: { suggest: vi.fn(), search: vi.fn(), searchByImage },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(CommerceAiSearchComponent);
    fixture.componentInstance.enableImageSearch = false;
    fixture.detectChanges();

    const file = new File(["x"], "shoe.png", { type: "image/png" });
    fixture.componentInstance.onDrop({
      preventDefault() {},
      dataTransfer: { files: [file] },
    } as unknown as DragEvent);

    expect(searchByImage).not.toHaveBeenCalled();
  });

  it("fetches suggestions when autocomplete is enabled", async () => {
    const suggestMock = vi.fn().mockResolvedValue({ suggestions: ["Red Shoes"] });

    await TestBed.configureTestingModule({
      imports: [CommerceAiSearchComponent],
      providers: [{ provide: CommerceAiApiService, useValue: { suggest: suggestMock, search: vi.fn() } }],
    }).compileComponents();

    const fixture = TestBed.createComponent(CommerceAiSearchComponent);
    fixture.componentInstance.enableAutocomplete = true;
    fixture.detectChanges();

    vi.useFakeTimers();
    fixture.componentInstance.onQueryChange("red");
    await vi.runAllTimersAsync();
    fixture.detectChanges();
    vi.useRealTimers();

    expect(suggestMock).toHaveBeenCalledWith(
      "/api/commerce-ai",
      "red",
      expect.objectContaining({ catalogLocale: undefined }),
      expect.any(AbortSignal),
    );
    expect(fixture.componentInstance.suggestions).toEqual(["Red Shoes"]);
  });

  it("hides suggestions when search results are visible", async () => {
    await TestBed.configureTestingModule({
      imports: [CommerceAiSearchComponent],
      providers: [{ provide: CommerceAiApiService, useValue: { suggest: vi.fn(), search: vi.fn() } }],
    }).compileComponents();

    const fixture = TestBed.createComponent(CommerceAiSearchComponent);
    fixture.componentInstance.enableAutocomplete = true;
    fixture.componentInstance.query = "glass";
    fixture.componentInstance.suggestionsReady = true;
    fixture.componentInstance.suggestions = ["Wine Glass"];
    fixture.componentInstance.hasSearched = true;
    fixture.componentInstance.results = [
      {
        id: "1",
        name: "Chianti Wine Glass",
        slug: "chianti-wine-glass",
      },
    ];
    fixture.detectChanges();

    expect(fixture.componentInstance.showResults).toBe(true);
    expect(fixture.componentInstance.showSuggestions).toBe(false);
  });

  it("clears results when typing so suggestions can show after a search", async () => {
    const suggest = vi.fn().mockResolvedValue({ suggestions: ["Wine Glass"] });
    await TestBed.configureTestingModule({
      imports: [CommerceAiSearchComponent],
      providers: [{ provide: CommerceAiApiService, useValue: { suggest, search: vi.fn() } }],
    }).compileComponents();

    const fixture = TestBed.createComponent(CommerceAiSearchComponent);
    fixture.componentInstance.enableAutocomplete = true;
    fixture.componentInstance.query = "glass";
    fixture.componentInstance.hasSearched = true;
    fixture.componentInstance.results = [
      {
        id: "1",
        name: "Chianti Wine Glass",
        slug: "chianti-wine-glass",
      },
    ];
    fixture.detectChanges();

    fixture.componentInstance.onQueryChange("wi");
    expect(fixture.componentInstance.results).toEqual([]);
    expect(fixture.componentInstance.hasSearched).toBe(false);
    expect(fixture.componentInstance.isLoadingSuggestions).toBe(true);
  });

  it("renders grouped mission results and hides the flat grid", async () => {
    const search = vi.fn().mockResolvedValue({
      products: [{ id: "p1", name: "Pro Racket", sku: "RACKET-1" }],
      meta: { searchTerms: ["racket", "balls"], queryInterpretation: "racket and balls" },
      mission: {
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
      },
    });

    await TestBed.configureTestingModule({
      imports: [CommerceAiSearchComponent],
      providers: [{ provide: CommerceAiApiService, useValue: { suggest: vi.fn(), search } }],
    }).compileComponents();

    const fixture = TestBed.createComponent(CommerceAiSearchComponent);
    fixture.componentInstance.enableMissions = true;
    fixture.componentInstance.enableFacets = true;
    fixture.componentInstance.query = "racket and balls";
    fixture.detectChanges();

    fixture.componentInstance.onSubmit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(search).toHaveBeenCalledWith(
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

  it("hides add-to-cart controls when enableCart is false", async () => {
    await TestBed.configureTestingModule({
      imports: [CommerceAiSearchComponent],
      providers: [{ provide: CommerceAiApiService, useValue: { suggest: vi.fn(), search: vi.fn() } }],
    }).compileComponents();

    const fixture = TestBed.createComponent(CommerceAiSearchComponent);
    fixture.componentInstance.enableCart = false;
    fixture.componentInstance.enableMissions = true;
    fixture.componentInstance.query = "racket and balls";
    fixture.componentInstance.hasSearched = true;
    fixture.componentInstance.mission = {
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
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector(".cat-cart-toggle")).toBeNull();
    expect(fixture.nativeElement.querySelector(".cat-mission__add-all")).toBeNull();
    expect(fixture.nativeElement.querySelector(".cat-result-card__add")).toBeNull();
  });
});
