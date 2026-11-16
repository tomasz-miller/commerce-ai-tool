import { expect, test, type Page } from "@playwright/test";

const meta = {
  total: 1,
  limit: 20,
  offset: 0,
  locale: "en-GB",
  catalogLocale: "en-GB",
  queryLocale: "en",
};

const products = [
  {
    id: "product-1",
    name: "Running shoe",
    sku: "SHOE-1",
    price: { amount: 99, currency: "EUR", formatted: "€99.00" },
  },
];

async function mockSearchApi(page: Page): Promise<void> {
  await page.route("**/api/commerce-ai/search/suggestions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ suggestions: [] }),
    });
  });
  await page.route("**/api/commerce-ai/search", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        products,
        meta,
      }),
    });
  });
  await page.route("**/api/commerce-ai/cart**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ cart: null }),
    });
  });
}

test("searches and renders product cards", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("commerce-ai-tool:anonymousId", "anon-e2e");
  });
  await mockSearchApi(page);
  await page.goto("/");

  await page.locator(".cat-search-input").fill("running shoes");
  await page.locator(".cat-search-input").press("Enter");

  await expect(page.locator(".cat-result-card").first()).toBeVisible();
  await expect(page.getByText("Running shoe").first()).toBeVisible();
});

test("submitting with Enter right after typing skips the suggestions request", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("commerce-ai-tool:anonymousId", "anon-e2e");
  });
  await mockSearchApi(page);
  let suggestionRequests = 0;
  // Registered after the shared mock, so it wins: the autocomplete request must not happen.
  await page.route("**/api/commerce-ai/search/suggestions", async (route) => {
    suggestionRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ suggestions: ["running shoes sale"] }),
    });
  });
  await page.goto("/");

  await page.locator(".cat-search-input").fill("running shoes");
  await page.locator(".cat-search-input").press("Enter");

  await expect(page.locator(".cat-result-card").first()).toBeVisible();
  // Give a (wrongly) surviving 200 ms suggestions timer time to fire.
  await page.waitForTimeout(500);
  expect(suggestionRequests).toBe(0);
  await expect(page.locator(".cat-suggestions")).toHaveCount(0);
});

test("image search renders its results and fills the query", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("commerce-ai-tool:anonymousId", "anon-e2e");
  });
  await mockSearchApi(page);
  await page.route("**/api/commerce-ai/search/image", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ products, meta, interpretation: "running shoe" }),
    });
  });
  await page.goto("/");

  // The camera input carries `capture`; the plain file input is the image upload.
  await page.locator('input[type="file"]:not([capture])').setInputFiles({
    name: "shoe.png",
    mimeType: "image/png",
    buffer: Buffer.from("not-a-real-png"),
  });

  await expect(page.locator(".cat-result-card").first()).toBeVisible();
  await expect(page.getByText("Running shoe").first()).toBeVisible();
  await expect(page.locator(".cat-search-input")).toHaveValue("running shoe");
  await expect(page.locator(".cat-status")).toHaveCount(0);
});

test("the added all confirmation shows and then resets", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("commerce-ai-tool:anonymousId", "anon-e2e");
  });
  const cart = {
    id: "cart-1",
    version: 2,
    anonymousId: "anon-e2e",
    lineItems: [],
    totalPrice: { amount: 99, currency: "EUR", formatted: "€99.00" },
    totalQuantity: 2,
  };
  await mockSearchApi(page);
  await page.route("**/api/commerce-ai/search", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        products,
        meta: { ...meta, searchTerms: ["racket", "balls"], queryInterpretation: "racket and balls" },
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
      }),
    });
  });
  await page.route("**/api/commerce-ai/cart/add-items", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ cart }),
    });
  });
  await page.goto("/");

  await page.locator(".cat-search-input").fill("a racket and balls");
  await page.locator(".cat-search-input").press("Enter");
  const addAll = page.locator(".cat-mission__add-all");
  await expect(addAll).toBeVisible();
  await expect(addAll).toContainText("Add 2 top picks to cart");

  await addAll.click();

  await expect(addAll).toContainText("Added to cart");
  await expect(addAll).toHaveClass(/cat-mission__add-all--added/);
  // Without a change-detection notification the confirmation would stay forever.
  await expect(addAll).toContainText("Add 2 top picks to cart", { timeout: 5000 });
  await expect(addAll).not.toHaveClass(/cat-mission__add-all--added/);
});

test.describe("camera overlay", () => {
  // playwright.config.ts starts Chromium with a synthetic camera, so getUserMedia succeeds.
  test.use({ permissions: ["camera"] });

  test("opens as a modal dialog, keeps Tab out of the page behind it, closes on Escape and returns focus to the camera button", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("commerce-ai-tool:anonymousId", "anon-e2e");
    });
    await mockSearchApi(page);
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Search by camera" });

    await trigger.focus();
    await trigger.press("Enter");

    const dialog = page.locator("dialog.cat-camera-overlay");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element: HTMLDialogElement) => element.matches(":modal"))).toBe(true);
    await expect(dialog.getByRole("button", { name: "Capture" })).toBeFocused();
    // The overlay still covers the whole viewport (the <dialog> user-agent box is reset).
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });

    // Tab wraps from the last control to the first and Shift+Tab back, and never reaches the
    // search field, the buttons or the other controls of the page behind the overlay.
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Capture" })).toBeFocused();
    for (let press = 0; press < 6; press += 1) {
      await page.keyboard.press("Tab");
      const behind = await page.evaluate(() => {
        const active = document.activeElement;
        return Boolean(active && active !== document.body && !active.closest("dialog"));
      });
      expect(behind).toBe(false);
    }
    await dialog.getByRole("button", { name: "Cancel" }).focus();

    await page.keyboard.press("Escape");

    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("after a capture the search starts and focus moves to the search field", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("commerce-ai-tool:anonymousId", "anon-e2e");
    });
    await mockSearchApi(page);
    await page.route("**/api/commerce-ai/search/image", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ products, meta, interpretation: "running shoe" }),
      });
    });
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Search by camera" });

    await trigger.focus();
    await trigger.press("Enter");
    const dialog = page.locator("dialog.cat-camera-overlay");
    // A capture needs a decoded frame; pressing Capture within milliseconds of opening would fail.
    await expect.poll(() => dialog.locator("video").evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2);
    await dialog.getByRole("button", { name: "Capture" }).press("Enter");

    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".cat-result-card").first()).toBeVisible();
    // The camera button is disabled while the search runs, so focus must not be lost to <body>.
    await expect(page.locator(".cat-search-input")).toBeFocused();
  });
});

test.describe("cart", () => {
  const cart = {
    id: "cart-1",
    version: 1,
    anonymousId: "anon-e2e",
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

  async function mockCart(page: Page): Promise<void> {
    await page.addInitScript(() => {
      localStorage.setItem("commerce-ai-tool:anonymousId", "anon-e2e");
    });
    await mockSearchApi(page);
    // Registered after the shared mock, so it wins.
    await page.route("**/api/commerce-ai/cart**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cart }) });
    });
  }

  const focusIsOutside = (page: Page) =>
    page.evaluate(() => {
      const active = document.activeElement;
      return Boolean(active && active !== document.body && !active.closest(".cat-cart-panel"));
    });

  test("is a modal dialog as a full-screen sheet: focus in, Tab wraps, Escape returns focus to the toggle", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockCart(page);
    await page.goto("/");
    const toggle = page.locator(".cat-cart-toggle");

    await toggle.focus();
    await toggle.press("Enter");

    const panel = page.locator(".cat-cart-panel");
    await expect(panel).toHaveAttribute("role", "dialog");
    await expect(panel).toHaveAttribute("aria-modal", "true");
    const closeButton = panel.getByRole("button", { name: "Close cart" });
    await expect(closeButton).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    expect(await focusIsOutside(page)).toBe(false);
    await expect(closeButton).not.toBeFocused();
    await page.keyboard.press("Tab");
    await expect(closeButton).toBeFocused();
    for (let press = 0; press < 12; press += 1) {
      await page.keyboard.press("Tab");
      expect(await focusIsOutside(page)).toBe(false);
    }

    await page.keyboard.press("Escape");

    await expect(panel).toHaveCount(0);
    await expect(toggle).toBeFocused();
  });

  test("is a popover without dialog semantics on wide screens and still closes on Escape", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockCart(page);
    await page.goto("/");
    const toggle = page.locator(".cat-cart-toggle");

    await toggle.focus();
    await toggle.press("Enter");

    const panel = page.locator(".cat-cart-panel");
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveAttribute("role", "dialog");
    await expect(panel).not.toHaveAttribute("aria-modal", "true");

    await page.keyboard.press("Escape");

    await expect(panel).toHaveCount(0);
    await expect(toggle).toBeFocused();
  });
});
