import { Component, provideZonelessChangeDetection } from "@angular/core";
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { resolveCommerceAISearchMessages } from "@commerce-ai-tool/core/client";
import { CommerceAiSearchBarComponent } from "./search-bar.component";

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

const messages = resolveCommerceAISearchMessages({});

@Component({
  standalone: true,
  imports: [CommerceAiSearchBarComponent],
  template: `<form commerce-ai-search-bar [messages]="messages" listboxId="list-1"></form>`,
})
class HostComponent {
  readonly messages = messages;
}

async function render(
  inputs: Record<string, unknown> = {},
): Promise<ComponentFixture<CommerceAiSearchBarComponent>> {
  await TestBed.configureTestingModule({
    imports: [CommerceAiSearchBarComponent],
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();
  const fixture = TestBed.createComponent(CommerceAiSearchBarComponent);
  fixture.componentRef.setInput("messages", messages);
  fixture.componentRef.setInput("listboxId", "cat-search-1-suggestions");
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture;
}

const root = (fixture: ComponentFixture<unknown>) => fixture.nativeElement as HTMLElement;
const input = (fixture: ComponentFixture<unknown>) =>
  root(fixture).querySelector(".cat-search-input") as HTMLInputElement;

describe("CommerceAiSearchBarComponent", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("is the search form itself, so the layout selectors keep matching", async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const form = (fixture.nativeElement as HTMLElement).firstElementChild as HTMLElement;

    expect(form.tagName).toBe("FORM");
    expect(form.classList.contains("cat-search-bar")).toBe(true);
    expect(form.querySelector(".cat-search-input")).not.toBeNull();
  });

  it("marks every decorative icon aria-hidden", async () => {
    const fixture = await render({ enableCart: true, showVoiceReplay: true });

    const icons = Array.from(root(fixture).querySelectorAll("svg"));
    expect(icons.length).toBeGreaterThanOrEqual(5);
    for (const icon of icons) {
      expect(icon.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("is a combobox wired to the listbox only while autocomplete is on", async () => {
    const fixture = await render({
      enableAutocomplete: true,
      expanded: true,
      activeDescendantId: "cat-search-1-suggestions-option-1",
    });

    expect(input(fixture).getAttribute("role")).toBe("combobox");
    expect(input(fixture).getAttribute("aria-expanded")).toBe("true");
    expect(input(fixture).getAttribute("aria-controls")).toBe("cat-search-1-suggestions");
    expect(input(fixture).getAttribute("aria-activedescendant")).toBe(
      "cat-search-1-suggestions-option-1",
    );

    fixture.componentRef.setInput("expanded", false);
    await fixture.whenStable();

    expect(input(fixture).getAttribute("aria-expanded")).toBe("false");
    expect(input(fixture).getAttribute("aria-controls")).toBeNull();
    expect(input(fixture).getAttribute("aria-activedescendant")).toBeNull();

    fixture.componentRef.setInput("enableAutocomplete", false);
    await fixture.whenStable();

    expect(input(fixture).getAttribute("role")).toBeNull();
    for (const attribute of ["aria-expanded", "aria-controls", "aria-activedescendant"]) {
      expect(input(fixture).hasAttribute(attribute), attribute).toBe(false);
    }
  });

  it("emits the typed text, key presses and the submit, and blocks the native submit", async () => {
    const fixture = await render();
    const typed: string[] = [];
    const keys: string[] = [];
    const submitted = vi.fn();
    fixture.componentInstance.queryChange.subscribe((value) => typed.push(value));
    fixture.componentInstance.inputKeyDown.subscribe((event) => keys.push(event.key));
    fixture.componentInstance.submitted.subscribe(submitted);

    input(fixture).value = "red shoes";
    input(fixture).dispatchEvent(new Event("input"));
    input(fixture).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    const submit = new Event("submit", { cancelable: true });
    root(fixture).dispatchEvent(submit);

    expect(typed).toEqual(["red shoes"]);
    expect(keys).toEqual(["ArrowDown"]);
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(submit.defaultPrevented).toBe(true);
  });

  it("waits for an IME composition to finish before emitting the text", async () => {
    const fixture = await render();
    const typed: string[] = [];
    fixture.componentInstance.queryChange.subscribe((value) => typed.push(value));

    input(fixture).value = "に";
    input(fixture).dispatchEvent(new InputEvent("input", { isComposing: true }));
    input(fixture).value = "日本";
    input(fixture).dispatchEvent(new InputEvent("input", { isComposing: true }));
    expect(typed).toEqual([]);

    input(fixture).dispatchEvent(new CompositionEvent("compositionend", { data: "日本" }));
    expect(typed).toEqual(["日本"]);

    input(fixture).value = "日本語";
    input(fixture).dispatchEvent(new InputEvent("input", { isComposing: false }));
    expect(typed).toEqual(["日本", "日本語"]);
  });

  it("shows the query it is given", async () => {
    const fixture = await render({ query: "winter boots" });
    expect(input(fixture).value).toBe("winter boots");

    fixture.componentRef.setInput("query", "sandals");
    await fixture.whenStable();
    expect(input(fixture).value).toBe("sandals");
  });

  it("renders the voice, camera, image and replay buttons from the flags with localized names", async () => {
    const fixture = await render({ showVoiceReplay: true });
    const label = (name: string) => root(fixture).querySelector(`[aria-label="${name}"]`);

    expect(label(messages.voiceSearch)).not.toBeNull();
    expect(label(messages.searchByCamera)).not.toBeNull();
    expect(label(messages.searchByImage)).not.toBeNull();
    expect(label(messages.replayVoiceSummary)).not.toBeNull();

    fixture.componentRef.setInput("enableVoice", false);
    fixture.componentRef.setInput("enableCameraSearch", false);
    fixture.componentRef.setInput("enableImageSearch", false);
    fixture.componentRef.setInput("showVoiceReplay", false);
    await fixture.whenStable();

    expect(root(fixture).querySelectorAll("button")).toHaveLength(0);
  });

  it("names the voice button after its action and does not also expose it as a toggle", async () => {
    const fixture = await render({ isRecording: true });
    const button = root(fixture).querySelector(`[aria-label="${messages.stopRecording}"]`);

    expect(button).not.toBeNull();
    expect(button?.hasAttribute("aria-pressed")).toBe(false);
    expect(root(fixture).querySelector(`[aria-label="${messages.voiceSearch}"]`)).toBeNull();
    expect(root(fixture).classList.contains("cat-search-bar--voice-active")).toBe(true);
  });

  it("emits one output per action button", async () => {
    const fixture = await render({ showVoiceReplay: true, enableCart: true, cartLabel: "Cart" });
    const component = fixture.componentInstance;
    const calls: string[] = [];
    component.voiceToggle.subscribe(() => calls.push("voice"));
    component.cameraClick.subscribe(() => calls.push("camera"));
    component.replay.subscribe(() => calls.push("replay"));
    component.cartToggle.subscribe(() => calls.push("cart"));

    for (const name of [messages.voiceSearch, messages.searchByCamera, messages.replayVoiceSummary, "Cart"]) {
      (root(fixture).querySelector(`[aria-label="${name}"]`) as HTMLButtonElement).click();
    }

    expect(calls).toEqual(["voice", "camera", "replay", "cart"]);
  });

  it("forwards the file picked in the image and camera inputs", async () => {
    const fixture = await render();
    const events: string[] = [];
    fixture.componentInstance.imageSelected.subscribe(() => events.push("image"));
    fixture.componentInstance.cameraFileSelected.subscribe(() => events.push("camera"));
    const inputs = root(fixture).querySelectorAll<HTMLInputElement>('input[type="file"]');
    expect(inputs).toHaveLength(2);

    inputs[0]!.dispatchEvent(new Event("change"));
    inputs[1]!.dispatchEvent(new Event("change"));

    expect(events).toEqual(["camera", "image"]);
    expect(fixture.componentInstance.cameraInput()?.nativeElement).toBe(inputs[0]);
  });

  it("discloses the cart with aria-expanded only", async () => {
    const fixture = await render({ enableCart: true, cartLabel: "Cart (3)", cartQuantity: 3, cartBadgeLabel: "3" });
    const toggle = root(fixture).querySelector(".cat-cart-toggle") as HTMLElement;

    expect(toggle.getAttribute("aria-label")).toBe("Cart (3)");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.hasAttribute("aria-pressed")).toBe(false);
    expect(toggle.querySelector(".cat-cart-badge")?.textContent?.trim()).toBe("3");

    fixture.componentRef.setInput("cartOpen", true);
    await fixture.whenStable();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.classList.contains("cat-cart-toggle--open")).toBe(true);
  });
});
