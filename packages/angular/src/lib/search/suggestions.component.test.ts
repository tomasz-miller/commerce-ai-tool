import { Component, provideZonelessChangeDetection } from "@angular/core";
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { resolveCommerceAISearchMessages } from "@commerce-ai-tool/core/client";
import { CommerceAiSuggestionsComponent } from "./suggestions.component";

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

const messages = resolveCommerceAISearchMessages({ suggestionsAriaLabel: "Search suggestions" });

@Component({
  standalone: true,
  imports: [CommerceAiSuggestionsComponent],
  template: `<div
    commerce-ai-suggestions
    [messages]="messages"
    [suggestions]="suggestions"
    listboxId="list-1"
  ></div>`,
})
class HostComponent {
  readonly messages = messages;
  suggestions: string[] = [];
}

async function render(
  inputs: Record<string, unknown> = {},
): Promise<ComponentFixture<CommerceAiSuggestionsComponent>> {
  await TestBed.configureTestingModule({
    imports: [CommerceAiSuggestionsComponent],
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();
  const fixture = TestBed.createComponent(CommerceAiSuggestionsComponent);
  fixture.componentRef.setInput("messages", messages);
  fixture.componentRef.setInput("listboxId", "cat-search-7-suggestions");
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture;
}

const root = (fixture: ComponentFixture<unknown>) => fixture.nativeElement as HTMLElement;

describe("CommerceAiSuggestionsComponent", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("renders the listbox inside the panel: id from the input, localized name, no hard-coded id", async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.suggestions = ["Red Shoes"];
    await fixture.whenStable();
    const panel = (fixture.nativeElement as HTMLElement).firstElementChild as HTMLElement;
    const listbox = panel.querySelector('[role="listbox"]') as HTMLElement;

    expect(panel.classList.contains("cat-suggestions")).toBe(true);
    expect(panel.hasAttribute("role")).toBe(false);
    expect(listbox.tagName).toBe("UL");
    expect(listbox.id).toBe("list-1");
    expect(listbox.getAttribute("aria-label")).toBe("Search suggestions");
  });

  it("renders no listbox while there are no options", async () => {
    const fixture = await render({ ready: true });

    expect(root(fixture).querySelector('[role="listbox"]')).toBeNull();
    expect(root(fixture).textContent).toContain(messages.noSuggestions);
  });

  it("renders one option per suggestion with ids derived from the listbox id", async () => {
    const fixture = await render({ suggestions: ["Red Shoes", "Red Boots"], activeIndex: 1 });

    const options = Array.from(root(fixture).querySelectorAll('[role="option"]'));
    expect(options.map((option) => option.textContent?.trim())).toEqual(["Red Shoes", "Red Boots"]);
    expect(options.map((option) => option.id)).toEqual([
      "cat-search-7-suggestions-option-0",
      "cat-search-7-suggestions-option-1",
    ]);
    expect(options.map((option) => option.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(options[1]!.classList.contains("cat-suggestions__item--active")).toBe(true);
  });

  it("emits the clicked suggestion and keeps focus in the input on mousedown", async () => {
    const fixture = await render({ suggestions: ["Red Shoes"] });
    const picked: string[] = [];
    fixture.componentInstance.suggestionSelect.subscribe((value) => picked.push(value));
    const option = root(fixture).querySelector('[role="option"]') as HTMLElement;

    const mousedown = new MouseEvent("mousedown", { cancelable: true, bubbles: true });
    option.dispatchEvent(mousedown);
    option.click();

    expect(mousedown.defaultPrevented).toBe(true);
    expect(picked).toEqual(["Red Shoes"]);
  });

  it("shows the loading, error and empty states in turn", async () => {
    const fixture = await render({ isLoading: true });
    expect(root(fixture).textContent).toContain(messages.loadingSuggestions);

    fixture.componentRef.setInput("isLoading", false);
    fixture.componentRef.setInput("ready", true);
    await fixture.whenStable();
    expect(root(fixture).textContent).toContain(messages.noSuggestions);

    fixture.componentRef.setInput("error", "Search failed");
    await fixture.whenStable();
    const alert = root(fixture).querySelector('[role="alert"]');
    expect(alert?.textContent?.trim()).toBe("Search failed");
    expect(root(fixture).textContent).not.toContain(messages.noSuggestions);
  });
});
