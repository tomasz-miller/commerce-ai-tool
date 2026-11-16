import { Component, provideZonelessChangeDetection } from "@angular/core";
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { resolveCommerceAISearchMessages, type ProductCard } from "@commerce-ai-tool/core/client";
import { CommerceAiResultsComponent } from "./results.component";

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

const messages = resolveCommerceAISearchMessages({});

const withImage: ProductCard = {
  id: "p1",
  name: "Running Shoe",
  slug: "running-shoe",
  sku: "SHOE-1",
  imageUrl: "https://example.test/shoe.jpg",
  price: { amount: 5000, currency: "EUR", formatted: "€50.00" },
} as ProductCard;
const noImage: ProductCard = { id: "p2", name: "Winter Boot", slug: "winter-boot", sku: "BOOT-1" };
const noSku: ProductCard = { id: "", name: "Mystery", slug: "mystery" };

@Component({
  standalone: true,
  imports: [CommerceAiResultsComponent],
  template: `<div commerce-ai-results [messages]="messages" [results]="results"></div>`,
})
class HostComponent {
  readonly messages = messages;
  readonly results = [noImage];
}

async function render(
  inputs: Record<string, unknown> = {},
): Promise<ComponentFixture<CommerceAiResultsComponent>> {
  await TestBed.configureTestingModule({
    imports: [CommerceAiResultsComponent],
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();
  const fixture = TestBed.createComponent(CommerceAiResultsComponent);
  fixture.componentRef.setInput("messages", messages);
  fixture.componentRef.setInput("results", [withImage, noImage]);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture;
}

const root = (fixture: ComponentFixture<unknown>) => fixture.nativeElement as HTMLElement;

describe("CommerceAiResultsComponent", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("is the results list with an accessible name", async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const host = TestBed.createComponent(HostComponent);
    await host.whenStable();
    const list = (host.nativeElement as HTMLElement).firstElementChild as HTMLElement;
    expect(list.tagName).toBe("DIV");
    expect(list.classList.contains("cat-results")).toBe(true);
    expect(list.getAttribute("role")).toBe("list");
    expect(list.getAttribute("aria-label")).toBe(messages.searchResultsAriaLabel);
  });

  it("drops the list semantics while there are no products", async () => {
    const empty = await render({ results: [] });

    expect(root(empty).hasAttribute("role")).toBe(false);
    expect(root(empty).hasAttribute("aria-label")).toBe(false);
  });

  it("renders one list item per product, the first one featured", async () => {
    const fixture = await render();

    const cards = Array.from(root(fixture).querySelectorAll("article"));
    expect(cards.map((card) => card.querySelector(".cat-result-name")?.textContent?.trim())).toEqual([
      "Running Shoe",
      "Winter Boot",
    ]);
    expect(cards.every((card) => card.getAttribute("role") === "listitem")).toBe(true);
    expect(cards[0]!.classList.contains("cat-result-card--featured")).toBe(true);
    expect(cards[1]!.classList.contains("cat-result-card--featured")).toBe(false);
    expect(cards[0]!.querySelector(".cat-result-price")?.textContent?.trim()).toBe("€50.00");
  });

  it("shows the product image decoratively, or an icon (not an emoji) as the placeholder", async () => {
    const fixture = await render();
    const [first, second] = Array.from(root(fixture).querySelectorAll("article"));

    expect(first!.querySelector("img")?.getAttribute("alt")).toBe("");
    const placeholder = second!.querySelector(".cat-result-image--placeholder")!;
    expect(placeholder.querySelector("img")).toBeNull();
    expect(placeholder.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(placeholder.textContent?.trim()).toBe("");
  });

  it("emits the selected product", async () => {
    const fixture = await render();
    const selected: ProductCard[] = [];
    fixture.componentInstance.productSelect.subscribe((product) => selected.push(product));

    (root(fixture).querySelectorAll(".cat-result-card__select")[1] as HTMLElement).click();

    expect(selected).toEqual([noImage]);
  });

  it("add-to-cart button name includes the product name", async () => {
    const fixture = await render({ enableCart: true, results: [withImage, noImage] });
    const labels = Array.from(root(fixture).querySelectorAll(".cat-result-card__add")).map((button) =>
      button.getAttribute("aria-label"),
    );

    expect(labels).toEqual(["Add Running Shoe to cart", "Add Winter Boot to cart"]);
  });

  it("adds to the cart with a name per state and disables what cannot be added", async () => {
    const fixture = await render({
      enableCart: true,
      results: [withImage, noImage, noSku],
      addedProductIds: { p2: true },
    });
    const added: ProductCard[] = [];
    fixture.componentInstance.addItem.subscribe((product) => added.push(product));
    const buttons = Array.from(root(fixture).querySelectorAll<HTMLButtonElement>(".cat-result-card__add"));

    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Add Running Shoe to cart",
      messages.itemAdded,
      messages.unableToAddToCart,
    ]);
    expect(buttons.map((button) => button.disabled)).toEqual([false, false, true]);
    expect(buttons[1]!.classList.contains("cat-result-card__add--added")).toBe(true);

    buttons[0]!.click();
    expect(added).toEqual([withImage]);

    fixture.componentRef.setInput("isMutating", true);
    await fixture.whenStable();
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });

  it("hides the add buttons when the cart is off", async () => {
    const fixture = await render();
    expect(root(fixture).querySelector(".cat-result-card__add")).toBeNull();
  });

  it("explains an empty result once a search has finished", async () => {
    const fixture = await render({ results: [], query: "purple unicorn" });
    expect(root(fixture).querySelector(".cat-status--empty")).toBeNull();

    fixture.componentRef.setInput("hasSearched", true);
    fixture.componentRef.setInput("queryInterpretation", "purple unicorns");
    await fixture.whenStable();

    const status = root(fixture).querySelector(".cat-status--empty")!;
    // Announced by the widget's one live region, so the visible block is not a live region itself.
    expect(status.hasAttribute("role")).toBe(false);
    expect(status.hasAttribute("aria-live")).toBe(false);
    expect(status.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(status.textContent).toContain(messages.noProductsFound);
    expect(status.textContent).toContain(`${messages.searchedFor} purple unicorns`);
  });
});
