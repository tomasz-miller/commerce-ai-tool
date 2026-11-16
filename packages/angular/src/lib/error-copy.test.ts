import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
  type CommerceAISearchMessages,
  type MissionSearchResult,
} from "@commerce-ai-tool/core/client";
import { CommerceAiMissionResultsComponent } from "./commerce-ai-mission-results.component";
import { CommerceAiSearchComponent } from "./commerce-ai-search.component";

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

/**
 * Every key translated to a marker that cannot be mistaken for an English default. A widget that
 * renders any English default, raw server text or browser exception text instead of these markers
 * has a hard-coded string on that error path.
 */
const KEYS = Object.keys(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES) as (keyof CommerceAISearchMessages)[];
const NAMED_KEYS = new Set<string>(["addToCartNamed", "removeItemNamed", "quantityFor"]);
const pl = Object.fromEntries(
  KEYS.map((key) => [key, NAMED_KEYS.has(key) ? `pl:${key} {name}` : `pl:${key}`]),
) as unknown as CommerceAISearchMessages;
const allPlText = Object.values(pl).join(" ");

const RAW_SERVER_TEXT = "Raw upstream exploded";
const RAW_DOM_TEXT = "Permission denied by system";

const englishDefaults = Object.values(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES).filter(
  (value) => value.length > 3 && !allPlText.includes(value),
);

function expectNoEnglishInDom(): void {
  const text = document.body.textContent ?? "";
  for (const english of englishDefaults) {
    expect(text, `English default "${english}" reached the DOM`).not.toContain(english);
  }
  expect(text).not.toContain(RAW_SERVER_TEXT);
  expect(text).not.toContain(RAW_DOM_TEXT);
  expect(text).not.toContain("Unexpected token");
}

function failure(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: RAW_SERVER_TEXT, code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

type Route = () => Response;

/** Routes `/api/commerce-ai/<path>`; every route not listed answers 200 with an empty body. */
function stubApi(routes: Record<string, Route>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "http://localhost").pathname.replace("/api/commerce-ai", "");
      return (routes[path] ?? (() => ok({})))();
    }),
  );
}

function stubMicrophone(options: { reject?: unknown } = {}) {
  class FakeMediaRecorder {
    state: "inactive" | "recording" = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["audio"]) });
      this.onstop?.();
    }
  }
  const stream = { getTracks: () => [{ stop: vi.fn() }] };
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(() => (options.reject ? Promise.reject(options.reject) : Promise.resolve(stream))),
    },
  });
}

async function render(
  inputs: Record<string, unknown> = {},
): Promise<ComponentFixture<CommerceAiSearchComponent>> {
  await TestBed.configureTestingModule({
    imports: [CommerceAiSearchComponent],
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();
  const fixture = TestBed.createComponent(CommerceAiSearchComponent);
  fixture.componentRef.setInput("apiBaseUrl", "/api/commerce-ai");
  fixture.componentRef.setInput("messages", pl);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  document.body.append(fixture.nativeElement);
  await fixture.whenStable();
  return fixture;
}

const root = (fixture: ComponentFixture<unknown>) => fixture.nativeElement as HTMLElement;

function typeQuery(fixture: ComponentFixture<unknown>, value: string): void {
  const input = root(fixture).querySelector(".cat-search-input") as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

function submit(fixture: ComponentFixture<unknown>): void {
  root(fixture).querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
}

function click(fixture: ComponentFixture<unknown>, label: string): void {
  const button = root(fixture).querySelector(`[aria-label="${label}"]`) as HTMLButtonElement | null;
  expect(button, `button "${label}"`).not.toBeNull();
  button!.click();
}

async function untilText(fixture: ComponentFixture<unknown>, selector: string): Promise<string> {
  let text = "";
  await vi.waitFor(() => {
    text = root(fixture).querySelector(selector)?.textContent?.trim() ?? "";
    expect(text, selector).not.toBe("");
  });
  return text;
}

describe("localized error copy (Angular)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "mediaDevices");
    document.body.replaceChildren();
  });

  it("no hard-coded English error string reaches the DOM: text search", async () => {
    stubApi({ "/search": () => failure(500, "INTERNAL") });
    const fixture = await render();

    typeQuery(fixture, "running shoes");
    submit(fixture);

    expect(await untilText(fixture, ".cat-status--error")).toBe(pl.searchFailed);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: an HTML error page from a proxy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 502 })));
    const fixture = await render();

    typeQuery(fixture, "running shoes");
    submit(fixture);

    expect(await untilText(fixture, ".cat-status--error")).toBe(pl.searchFailed);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: rate limit", async () => {
    stubApi({ "/search": () => failure(429, "RATE_LIMITED") });
    const fixture = await render();

    typeQuery(fixture, "running shoes");
    submit(fixture);

    expect(await untilText(fixture, ".cat-status--error")).toBe(pl.rateLimited);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: image search", async () => {
    stubApi({ "/search/image": () => failure(500, "INTERNAL") });
    const fixture = await render({ enableCameraSearch: false });

    const store = (fixture.componentInstance as unknown as { store: { searchByImage(f: File): Promise<void> } }).store;
    await store.searchByImage(new File(["x"], "shoe.png", { type: "image/png" }));
    await fixture.whenStable();

    expect(await untilText(fixture, ".cat-status--error")).toBe(pl.imageSearchFailed);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: suggestions", async () => {
    stubApi({ "/search/suggestions": () => failure(500, "INTERNAL") });
    const fixture = await render({ enableAutocomplete: true });

    typeQuery(fixture, "running");

    expect(await untilText(fixture, ".cat-suggestions__status--error")).toBe(pl.searchFailed);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: microphone refused", async () => {
    stubMicrophone({ reject: new DOMException(RAW_DOM_TEXT, "NotAllowedError") });
    stubApi({});
    const fixture = await render();

    click(fixture, pl.voiceSearch);

    expect(await untilText(fixture, ".cat-voice-banner--error")).toContain(pl.microphoneDenied);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: microphone missing", async () => {
    stubMicrophone({ reject: new DOMException(RAW_DOM_TEXT, "NotFoundError") });
    stubApi({});
    const fixture = await render();

    click(fixture, pl.voiceSearch);

    expect(await untilText(fixture, ".cat-voice-banner--error")).toContain(pl.microphoneUnavailable);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: voice request fails", async () => {
    stubMicrophone();
    stubApi({ "/search/voice": () => failure(500, "INTERNAL") });
    const fixture = await render();

    click(fixture, pl.voiceSearch);
    await vi.waitFor(() => expect(root(fixture).querySelector(".cat-voice-banner")).not.toBeNull());
    click(fixture, pl.stopRecording);

    expect(await untilText(fixture, ".cat-voice-banner--error")).toContain(pl.searchFailed);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: camera refused", async () => {
    stubMicrophone({ reject: new DOMException(RAW_DOM_TEXT, "NotAllowedError") });
    stubApi({});
    const fixture = await render();

    await fixture.componentInstance.openCameraOverlay();

    expect(await untilText(fixture, ".cat-camera-overlay__error")).toContain(pl.cameraDenied);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: cart load and add to cart", async () => {
    stubApi({
      "/cart": () => failure(500, "INTERNAL"),
      "/cart/add": () => failure(500, "CART_NOT_FOUND"),
    });
    const fixture = await render({ enableCart: true, currency: "EUR" });

    click(fixture, pl.cartAriaLabel);

    expect(await untilText(fixture, ".cat-cart-panel .cat-status--error")).toBe(pl.cartLoadFailed);
    expectNoEnglishInDom();

    await fixture.componentInstance.cart.addToCart({ sku: "SHOE-1" });
    await fixture.whenStable();
    expect(await untilText(fixture, ".cat-cart-panel .cat-status--error")).toBe(pl.unableToAddToCart);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: cart sign in", async () => {
    stubApi({
      "/cart": () => ok({ cart: null }),
      "/cart/login": () => failure(401, "INVALID_CREDENTIALS"),
    });
    const fixture = await render({ enableCart: true, currency: "EUR" });

    click(fixture, pl.cartAriaLabel);
    await vi.waitFor(() => expect(root(fixture).querySelector(".cat-cart-panel__auth-toggle")).not.toBeNull());
    (root(fixture).querySelector(".cat-cart-panel__auth-toggle") as HTMLButtonElement).click();
    await fixture.whenStable();
    await fixture.componentInstance.cart.login({ email: "a@example.test", password: "wrong" });
    await fixture.whenStable();

    expect(await untilText(fixture, ".cat-cart-panel .cat-status--error")).toBe(pl.invalidCredentials);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: mission lanes", async () => {
    await TestBed.configureTestingModule({
      imports: [CommerceAiMissionResultsComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(CommerceAiMissionResultsComponent);
    const mission: MissionSearchResult = {
      interpretation: "x and y",
      intents: [
        { intent: { id: "i0", label: "x", quantity: 1, searchTerms: ["x"] }, products: [], total: 0 },
        {
          intent: { id: "i1", label: "y", quantity: 1, searchTerms: ["y"] },
          products: [],
          total: 0,
          failed: true,
        },
      ],
    };
    fixture.componentRef.setInput("mission", mission);
    fixture.componentRef.setInput("messages", pl);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();

    const titles = Array.from(root(fixture).querySelectorAll(".cat-status__title")).map((node) => node.textContent);
    expect(titles).toEqual([pl.missionIntentEmpty, pl.missionIntentFailed]);
    expectNoEnglishInDom();
  });
});
