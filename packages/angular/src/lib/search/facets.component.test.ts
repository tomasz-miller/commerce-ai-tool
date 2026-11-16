import { Component, provideZonelessChangeDetection } from "@angular/core";
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { resolveCommerceAISearchMessages, type SearchFacetGroup } from "@commerce-ai-tool/core/client";
import { CommerceAiFacetsComponent, type FacetToggle } from "./facets.component";

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

const messages = resolveCommerceAISearchMessages({});

const facets: SearchFacetGroup[] = [
  {
    id: "color",
    label: "Color",
    buckets: [
      { key: "red", label: "Red", count: 4 },
      { key: "#0000ff", label: "Blue", count: 2 },
    ],
  },
  {
    id: "price",
    label: "Price",
    currency: "JPY",
    buckets: [{ key: "under-50", label: "Under 50", count: 7 }],
  },
] as SearchFacetGroup[];

@Component({
  standalone: true,
  imports: [CommerceAiFacetsComponent],
  template: `<section commerce-ai-facets [messages]="messages"></section>`,
})
class HostComponent {
  readonly messages = messages;
}

async function render(
  inputs: Record<string, unknown> = {},
): Promise<ComponentFixture<CommerceAiFacetsComponent>> {
  await TestBed.configureTestingModule({
    imports: [CommerceAiFacetsComponent],
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();
  const fixture = TestBed.createComponent(CommerceAiFacetsComponent);
  fixture.componentRef.setInput("messages", messages);
  fixture.componentRef.setInput("facets", facets);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture;
}

const root = (fixture: ComponentFixture<unknown>) => fixture.nativeElement as HTMLElement;
const chips = (fixture: ComponentFixture<unknown>) =>
  Array.from(root(fixture).querySelectorAll<HTMLButtonElement>(".cat-facet-chip"));

describe("CommerceAiFacetsComponent", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("is the facets section, named from the messages", async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const section = (fixture.nativeElement as HTMLElement).firstElementChild as HTMLElement;

    expect(section.tagName).toBe("SECTION");
    expect(section.classList.contains("cat-facets")).toBe(true);
    expect(section.getAttribute("aria-label")).toBe(messages.filtersAriaLabel);
  });

  it("renders a labelled group per facet with a count on every chip", async () => {
    const fixture = await render();

    const groups = Array.from(root(fixture).querySelectorAll('[role="group"]'));
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual(["Color", "Price"]);
    expect(chips(fixture).map((chip) => chip.querySelector(".cat-facet-chip__count")?.textContent)).toEqual([
      "4",
      "2",
      "7",
    ]);
    expect(root(fixture).querySelector(".cat-facets__new")).not.toBeNull();
  });

  it("marks the chips of the applied filters as pressed, using the group currency for price", async () => {
    const fixture = await render({ appliedFilters: { priceMax: "5000" } });
    // Price filters are stored in minor units of the facet currency (JPY has none).
    const price = chips(fixture)[2]!;
    expect(price.getAttribute("aria-pressed")).toBe("true");
    expect(price.classList.contains("cat-facet-chip--selected")).toBe(true);
    expect(chips(fixture)[0]!.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows a swatch for colour facets only, hidden from assistive technology", async () => {
    const fixture = await render();

    const swatches = root(fixture).querySelectorAll(".cat-facet-chip__swatch");
    expect(swatches.length).toBeGreaterThan(0);
    for (const swatch of Array.from(swatches)) {
      expect(swatch.getAttribute("aria-hidden")).toBe("true");
    }
    expect(chips(fixture)[2]!.querySelector(".cat-facet-chip__swatch")).toBeNull();
  });

  it("emits the clicked chip with its facet id, key and currency", async () => {
    const fixture = await render();
    const toggles: FacetToggle[] = [];
    fixture.componentInstance.toggle.subscribe((value) => toggles.push(value));

    chips(fixture)[0]!.click();
    chips(fixture)[2]!.click();

    expect(toggles).toEqual([
      { facetId: "color", key: "red", currency: undefined },
      { facetId: "price", key: "under-50", currency: "JPY" },
    ]);
  });

  it("offers clear only while filters are applied, and always a new search", async () => {
    const fixture = await render();
    const calls: string[] = [];
    fixture.componentInstance.clear.subscribe(() => calls.push("clear"));
    fixture.componentInstance.newSearch.subscribe(() => calls.push("new"));
    expect(root(fixture).querySelector(".cat-facets__clear")).toBeNull();

    fixture.componentRef.setInput("hasAppliedFilters", true);
    await fixture.whenStable();
    (root(fixture).querySelector(".cat-facets__clear") as HTMLElement).click();
    (root(fixture).querySelector(".cat-facets__new") as HTMLElement).click();

    expect(calls).toEqual(["clear", "new"]);
  });
});
