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
});
