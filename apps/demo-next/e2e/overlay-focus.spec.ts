import { expect, test, type Page } from "@playwright/test";
import { gotoHydrated } from "./helpers";

const products = [
  {
    id: "product-1",
    name: "Running shoe",
    sku: "SHOE-1",
    price: { amount: 99, currency: "EUR", formatted: "€99.00" },
  },
];

const meta = {
  total: 1,
  limit: 20,
  offset: 0,
  locale: "en-GB",
  catalogLocale: "en-GB",
  queryLocale: "en",
};

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

async function mockApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("commerce-ai-tool:anonymousId", "anon-e2e");
  });
  await page.route("**/api/commerce-ai/search/suggestions", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"suggestions":[]}' }),
  );
  await page.route("**/api/commerce-ai/search/image", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ products, meta, interpretation: "running shoe" }),
    }),
  );
  await page.route("**/api/commerce-ai/cart**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cart }) }),
  );
}

const focusIsOutside = (page: Page, selector: string) =>
  page.evaluate((container) => {
    const active = document.activeElement;
    return Boolean(active && active !== document.body && !active.closest(container));
  }, selector);

test.describe("camera overlay", () => {
  test.use({ permissions: ["camera"] });

  test("is a modal dialog: focus on Capture, Tab wraps, Escape closes and returns focus to the camera button", async ({
    page,
  }) => {
    await mockApi(page);
    await gotoHydrated(page, "/");
    const trigger = page.getByRole("button", { name: "Search by camera" });

    await trigger.focus();
    await trigger.press("Enter");

    const dialog = page.locator("dialog.cat-camera-overlay");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element: HTMLDialogElement) => element.matches(":modal"))).toBe(true);
    await expect(dialog.getByRole("button", { name: "Capture" })).toBeFocused();
    // Same full-viewport box as the Angular widget (the <dialog> user-agent box is reset).
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });

    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Capture" })).toBeFocused();
    for (let press = 0; press < 6; press += 1) {
      await page.keyboard.press("Tab");
      expect(await focusIsOutside(page, "dialog")).toBe(false);
    }

    await page.keyboard.press("Escape");

    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("after a capture the search starts and focus moves to the search field", async ({ page }) => {
    await mockApi(page);
    await gotoHydrated(page, "/");
    const trigger = page.getByRole("button", { name: "Search by camera" });

    await trigger.focus();
    await trigger.press("Enter");
    const dialog = page.locator("dialog.cat-camera-overlay");
    // A capture needs a decoded frame; pressing Capture within milliseconds of opening would fail.
    await expect.poll(() => dialog.locator("video").evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2);
    await dialog.getByRole("button", { name: "Capture" }).press("Enter");

    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("list", { name: "Search results" }).getByRole("button", { name: /^Running shoe/ }),
    ).toBeVisible();
    // The camera button is disabled while the search runs, so focus must not be lost to <body>.
    await expect(page.locator(".cat-search-input")).toBeFocused();
  });
});

test.describe("cart", () => {
  test("is a modal dialog as a full-screen sheet: focus in, Tab wraps, Escape returns focus to the toggle", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockApi(page);
    await gotoHydrated(page, "/");
    const toggle = page.locator(".cat-cart-toggle");

    await toggle.focus();
    await toggle.press("Enter");

    const panel = page.locator(".cat-cart-panel");
    await expect(panel).toHaveAttribute("role", "dialog");
    await expect(panel).toHaveAttribute("aria-modal", "true");
    const closeButton = panel.getByRole("button", { name: "Close cart" });
    await expect(closeButton).toBeFocused();
    // The cart loads once the widget has hydrated and its buttons are disabled meanwhile. The Tab
    // loop is computed from the controls present at each key press, so let the cart settle first;
    // a cart that arrives between two presses moves the first and last stop under the test.
    await expect(panel.locator(".cat-checkout-cta")).toBeEnabled();

    await page.keyboard.press("Shift+Tab");
    expect(await focusIsOutside(page, ".cat-cart-panel")).toBe(false);
    await expect(closeButton).not.toBeFocused();
    await page.keyboard.press("Tab");
    await expect(closeButton).toBeFocused();
    for (let press = 0; press < 12; press += 1) {
      await page.keyboard.press("Tab");
      expect(await focusIsOutside(page, ".cat-cart-panel")).toBe(false);
    }

    await page.keyboard.press("Escape");

    await expect(panel).toHaveCount(0);
    await expect(toggle).toBeFocused();
  });

  test("is a popover without dialog semantics on wide screens and still closes on Escape", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockApi(page);
    await gotoHydrated(page, "/");
    const toggle = page.locator(".cat-cart-toggle");

    await toggle.focus();
    await toggle.press("Enter");

    const panel = page.locator(".cat-cart-panel");
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveAttribute("role", "dialog");
    await expect(panel).not.toHaveAttribute("aria-modal", "true");
    await expect(toggle).toBeFocused();

    await page.keyboard.press("Escape");

    await expect(panel).toHaveCount(0);
    await expect(toggle).toBeFocused();
  });
});
