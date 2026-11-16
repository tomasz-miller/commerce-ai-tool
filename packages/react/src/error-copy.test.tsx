import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
  type CommerceAISearchMessages,
} from "@commerce-ai-tool/core/client";
import { CommerceAISearch } from "./components/CommerceAISearch.js";
import { CommerceAICheckout } from "./components/CommerceAICheckout.js";
import { CommerceAIOrderStatus } from "./components/CommerceAIOrderStatus.js";

/**
 * Every key translated to a marker that cannot be mistaken for an English default. A widget that
 * renders any English default, raw server text or browser exception text instead of these
 * markers has a hard-coded string on that error path.
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

type Route = (request: { url: URL; init?: RequestInit }) => Response | Promise<Response>;

/** Routes `/api/commerce-ai/<path>`; every route not listed answers 200 with an empty body. */
function stubApi(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const path = url.pathname.replace("/api/commerce-ai", "");
    const route = routes[path];
    if (route) return route({ url, init });
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const cart = {
  id: "cart-1",
  version: 1,
  anonymousId: "anon-1",
  lineItems: [
    {
      id: "line-1",
      name: "Running shoe",
      productId: "product-1",
      quantity: 1,
      price: { amount: 99, currency: "EUR", formatted: "€99.00" },
    },
  ],
  totalPrice: { amount: 99, currency: "EUR", formatted: "€99.00" },
  totalQuantity: 1,
};

const product = {
  id: "product-1",
  sku: "sku-1",
  name: "Running shoe",
  price: { amount: 99, currency: "EUR", formatted: "€99.00" },
};

class FakeMediaRecorder {
  mimeType = "audio/webm";
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void | Promise<void>) | null = null;
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) });
    void this.onstop?.();
  }
}

describe("localized error copy", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("no hard-coded English error string reaches the DOM: text search", async () => {
    stubApi({ "/search": () => failure(500, "INTERNAL") });
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" messages={pl} enableCart={false} />);

    const input = screen.getByRole("searchbox", { name: pl.searchAriaLabel });
    fireEvent.change(input, { target: { value: "running shoes" } });
    fireEvent.submit(input.closest("form")!);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(pl.searchFailed);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: an HTML error page from a proxy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>502 Bad Gateway</html>", { status: 502 })),
    );
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" messages={pl} />);

    const input = screen.getByRole("searchbox", { name: pl.searchAriaLabel });
    fireEvent.change(input, { target: { value: "running shoes" } });
    fireEvent.submit(input.closest("form")!);

    expect((await screen.findByRole("alert")).textContent).toBe(pl.searchFailed);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: rate limit", async () => {
    stubApi({ "/search": () => failure(429, "RATE_LIMITED") });
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" messages={pl} />);

    const input = screen.getByRole("searchbox", { name: pl.searchAriaLabel });
    fireEvent.change(input, { target: { value: "running shoes" } });
    fireEvent.submit(input.closest("form")!);

    expect((await screen.findByRole("alert")).textContent).toBe(pl.rateLimited);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: image search", async () => {
    stubApi({ "/search/image": () => failure(500, "INTERNAL") });
    const { container } = render(
      <CommerceAISearch apiBaseUrl="/api/commerce-ai" messages={pl} enableCameraSearch={false} />,
    );

    const file = new File(["x"], "shoe.png", { type: "image/png" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });

    expect((await screen.findByRole("alert")).textContent).toBe(pl.imageSearchFailed);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: microphone refused", async () => {
    const denied = new DOMException(RAW_DOM_TEXT, "NotAllowedError");
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(denied) },
    });
    stubApi({});
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" messages={pl} />);

    fireEvent.click(screen.getByRole("button", { name: pl.voiceSearch }));

    expect((await screen.findByRole("alert")).textContent).toContain(pl.microphoneDenied);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: microphone missing", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException(RAW_DOM_TEXT, "NotFoundError")),
      },
    });
    stubApi({});
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" messages={pl} />);

    fireEvent.click(screen.getByRole("button", { name: pl.voiceSearch }));

    expect((await screen.findByRole("alert")).textContent).toContain(pl.microphoneUnavailable);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: voice request fails", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
      },
    });
    stubApi({ "/search/voice": () => failure(500, "INTERNAL") });
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" messages={pl} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: pl.voiceSearch }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: pl.stopRecording }));
    });

    expect((await screen.findByRole("alert")).textContent).toContain(pl.searchFailed);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: camera refused", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException(RAW_DOM_TEXT, "NotAllowedError")),
      },
    });
    stubApi({});
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" messages={pl} />);

    fireEvent.click(screen.getByRole("button", { name: pl.searchByCamera }));

    await waitFor(() => expect(document.body.textContent).toContain(pl.cameraDenied));
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: suggestions", async () => {
    stubApi({ "/search/suggestions": () => failure(500, "INTERNAL") });
    render(<CommerceAISearch apiBaseUrl="/api/commerce-ai" messages={pl} enableAutocomplete />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "running" } });

    await waitFor(() => expect(document.body.textContent).toContain(pl.searchFailed), {
      timeout: 2000,
    });
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: add to cart and cart panel", async () => {
    stubApi({
      "/search": () => ok({ products: [product], meta: {} }),
      "/cart": () => ok({ cart: null }),
      "/cart/add": () => failure(500, "CART_NOT_FOUND"),
      "/cart/login": () => failure(401, "INVALID_CREDENTIALS"),
    });
    render(
      <CommerceAISearch apiBaseUrl="/api/commerce-ai" messages={pl} enableCart currency="EUR" />,
    );

    const input = screen.getByRole("searchbox", { name: pl.searchAriaLabel });
    fireEvent.change(input, { target: { value: "running shoes" } });
    fireEvent.submit(input.closest("form")!);

    fireEvent.click(await screen.findByRole("button", { name: /^pl:addToCartNamed Running shoe$/ }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(pl.cartAriaLabel) }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(pl.unableToAddToCart);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: cart sign in", async () => {
    stubApi({
      "/cart": () => ok({ cart: null }),
      "/cart/login": () => failure(401, "INVALID_CREDENTIALS"),
    });
    render(
      <CommerceAISearch apiBaseUrl="/api/commerce-ai" messages={pl} enableCart currency="EUR" />,
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(pl.cartAriaLabel) }));
    fireEvent.click(await screen.findByRole("button", { name: pl.signInToSyncCart }));
    fireEvent.change(screen.getByLabelText(pl.email), { target: { value: "a@example.test" } });
    fireEvent.change(screen.getByLabelText(pl.password), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: pl.signIn }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(pl.invalidCredentials);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: checkout", async () => {
    stubApi({
      "/cart": () => ok({ cart }),
      "/cart/addresses": () => failure(500, "CHECKOUT_INCOMPLETE"),
    });
    render(<CommerceAICheckout apiBaseUrl="/api/commerce-ai" messages={pl} />);

    for (const [label, value] of [
      [pl.firstName, "Ada"],
      [pl.lastName, "Lovelace"],
      [pl.streetName, "Main Street"],
      [pl.postalCode, "10115"],
      [pl.city, "Berlin"],
    ] as const) {
      fireEvent.change(await screen.findByLabelText(label), { target: { value } });
    }
    fireEvent.click(screen.getByRole("button", { name: pl.continueToDelivery }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(pl.checkoutFailed);
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: order status", async () => {
    stubApi({
      "/cart": () => ok({ cart: null }),
      "/orders": () => failure(404, "ORDER_NOT_FOUND"),
    });
    render(<CommerceAIOrderStatus apiBaseUrl="/api/commerce-ai" messages={pl} orderNumber="cat-1" />);

    await screen.findByRole("heading", { name: pl.orderNotFound });
    expectNoEnglishInDom();
  });

  it("no hard-coded English error string reaches the DOM: order list fails", async () => {
    stubApi({
      "/cart": () => ok({ cart: null }),
      "/orders": () => failure(500, "INTERNAL"),
    });
    render(<CommerceAIOrderStatus apiBaseUrl="/api/commerce-ai" messages={pl} />);

    await waitFor(() => expect(document.body.textContent).toContain(pl.noOrdersYet));
    expectNoEnglishInDom();
  });
});
