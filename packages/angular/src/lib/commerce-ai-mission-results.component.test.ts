import "zone.js";
import "zone.js/testing";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { resolveCommerceAISearchMessages } from "@commerce-ai-tool/core/client";
import type { AddToCartLineItem, MissionSearchResult } from "@commerce-ai-tool/core/client";
import { CommerceAiMissionResultsComponent } from "./commerce-ai-mission-results.component.js";

const messages = resolveCommerceAISearchMessages();

const mission: MissionSearchResult = {
  interpretation: "racket and balls",
  intents: [
    {
      intent: {
        id: "intent-0",
        label: "tennis racket",
        quantity: 1,
        searchTerms: ["tennis racket"],
      },
      products: [
        { id: "p1", name: "Pro Racket", sku: "RACKET-1", price: { amount: 80, currency: "EUR", formatted: "€80" } },
        { id: "p2", name: "Club Racket", sku: "RACKET-2", price: { amount: 40, currency: "EUR", formatted: "€40" } },
      ],
      total: 2,
    },
    {
      intent: {
        id: "intent-1",
        label: "golf balls",
        quantity: 2,
        searchTerms: ["golf balls"],
      },
      products: [
        { id: "p3", name: "Tour Balls", sku: "BALL-1", price: { amount: 20, currency: "EUR", formatted: "€20" } },
      ],
      total: 1,
    },
  ],
};

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

describe("CommerceAiMissionResultsComponent", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  async function render(options?: {
    mission?: MissionSearchResult;
    enableCart?: boolean;
    bindProductSelect?: boolean;
  }) {
    await TestBed.configureTestingModule({
      imports: [CommerceAiMissionResultsComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CommerceAiMissionResultsComponent);
    fixture.componentInstance.mission = options?.mission ?? mission;
    fixture.componentInstance.messages = messages;
    fixture.componentInstance.enableCart = options?.enableCart ?? true;
    fixture.componentInstance.isMutating = false;
    if (options?.bindProductSelect) {
      fixture.componentInstance.productSelect.subscribe(() => undefined);
    }
    fixture.detectChanges();
    return fixture;
  }

  it("adds the first product from each filled lane at quantity 1", async () => {
    const fixture = await render();
    const onAddAll = vi.fn().mockResolvedValue({ id: "cart-1" });
    fixture.componentInstance.addAll.subscribe(onAddAll);
    fixture.componentInstance.addAllHandler = onAddAll;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("tennis racket");
    expect(fixture.nativeElement.textContent).toContain("golf balls");
    expect(fixture.nativeElement.textContent).toContain("Looking for 2");
    expect(fixture.nativeElement.textContent).not.toContain("Looking for 1");

    const cards = fixture.nativeElement.querySelectorAll(".cat-mission-group__products .cat-result-card");
    expect(cards[0]?.className).toContain("cat-result-card--primary");
    expect(cards[1]?.className).toContain("cat-result-card--compact");
    expect(cards[2]?.className).toContain("cat-result-card--primary");

    const addAll = fixture.nativeElement.querySelector(".cat-mission__add-all") as HTMLButtonElement;
    expect(addAll.textContent?.trim()).toBe("Add 2 top picks to cart");
    addAll.click();

    expect(onAddAll).toHaveBeenCalledWith([
      { sku: "RACKET-1", quantity: 1 },
      { sku: "BALL-1", quantity: 1 },
    ]);
  });

  it("emits product select and add item from cards", async () => {
    const fixture = await render({ bindProductSelect: true });
    const onProductSelect = vi.fn();
    const onAddItem = vi.fn();
    fixture.componentInstance.productSelect.subscribe(onProductSelect);
    fixture.componentInstance.addItem.subscribe(onAddItem);
    fixture.detectChanges();

    const nameButtons = Array.from(
      fixture.nativeElement.querySelectorAll(".cat-result-card__select"),
    ) as HTMLButtonElement[];
    nameButtons[1]?.click();
    expect(onProductSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "p2", sku: "RACKET-2" }));

    const addButtons = Array.from(
      fixture.nativeElement.querySelectorAll('[aria-label="Add to cart"]'),
    ) as HTMLButtonElement[];
    addButtons[1]?.click();
    expect(onAddItem).toHaveBeenCalledWith(expect.objectContaining({ id: "p2", sku: "RACKET-2" }));
  });

  it("renders empty and failed intent states", async () => {
    const fixture = await render({
      enableCart: false,
      mission: {
        interpretation: "partial",
        intents: [
          {
            intent: { id: "intent-0", label: "missing", quantity: 1, searchTerms: ["missing"] },
            products: [],
            total: 0,
          },
          {
            intent: { id: "intent-1", label: "failed", quantity: 1, searchTerms: ["failed"] },
            products: [],
            total: 0,
            failed: true,
          },
        ],
      },
    });

    expect(fixture.nativeElement.textContent).toContain(messages.missionIntentEmpty);
    expect(fixture.nativeElement.textContent).toContain(messages.missionIntentFailed);
  });

  it("renders product cards as non-buttons when productSelect is not observed", async () => {
    const fixture = await render({ enableCart: false });
    expect(fixture.nativeElement.querySelector("button.cat-result-card__select")).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("Pro Racket");
  });

  it("keeps the confirmation off when the add-all handler returns null", async () => {
    const fixture = await render();
    const emitted: unknown[] = [];
    fixture.componentInstance.addAll.subscribe((items) => emitted.push(items));
    fixture.componentInstance.addAllHandler = vi.fn().mockResolvedValue(null);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector(".cat-mission__add-all") as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(emitted).toHaveLength(1);
    expect(fixture.componentInstance.justAddedAll).toBe(false);
  });

  it("emits the same bundle instance to the output and the handler", async () => {
    const fixture = await render();
    const emitted: AddToCartLineItem[][] = [];
    const handled: AddToCartLineItem[][] = [];
    fixture.componentInstance.addAll.subscribe((items) => emitted.push(items));
    fixture.componentInstance.addAllHandler = vi.fn(async (items: AddToCartLineItem[]) => {
      handled.push(items);
      return { id: "cart-1" };
    });
    fixture.detectChanges();

    (fixture.nativeElement.querySelector(".cat-mission__add-all") as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(emitted).toHaveLength(1);
    expect(handled).toHaveLength(1);
    expect(emitted[0]).toBe(handled[0]);
    expect(fixture.componentInstance.justAddedAll).toBe(true);
  });

  it("resets the add-all confirmation when a new mission arrives", async () => {
    const fixture = await render();
    fixture.componentInstance.addAllHandler = vi.fn().mockResolvedValue({ id: "cart-1" });
    fixture.detectChanges();

    (fixture.nativeElement.querySelector(".cat-mission__add-all") as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fixture.componentInstance.justAddedAll).toBe(true);

    fixture.componentInstance.mission = {
      interpretation: "new search",
      intents: [
        {
          intent: { id: "intent-2", label: "new", quantity: 1, searchTerms: ["new"] },
          products: [{ id: "p9", name: "New Product", sku: "NEW-1" }],
          total: 1,
        },
      ],
    };
    fixture.componentInstance.ngOnChanges();
    expect(fixture.componentInstance.justAddedAll).toBe(false);
  });

  it("returns the cached bundle while the mission reference is unchanged", async () => {
    const fixture = await render();
    expect(fixture.componentInstance.bundleItems).toBe(fixture.componentInstance.bundleItems);
  });

  it("clears the pending add-all timer on destroy", async () => {
    const fixture = await render();
    fixture.componentInstance.addAllHandler = vi.fn().mockResolvedValue({ id: "cart-1" });
    fixture.detectChanges();

    (fixture.nativeElement.querySelector(".cat-mission__add-all") as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fixture.componentInstance.justAddedAll).toBe(true);

    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    fixture.componentInstance.ngOnDestroy();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
