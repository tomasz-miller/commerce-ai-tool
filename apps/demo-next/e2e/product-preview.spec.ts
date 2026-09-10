import { expect, test, type Page } from "@playwright/test";

async function openRedGlassPreview(page: Page) {
  await page.route("**/api/commerce-ai/search", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        products: [
          {
            id: "glass",
            name: "Red Glass",
            description: "A stemmed tasting glass.",
            sku: "GLASS-RED",
            price: { amount: 24, currency: "EUR", formatted: "€24.00" },
          },
        ],
        meta: {
          total: 1,
          limit: 20,
          offset: 0,
          locale: "en",
          catalogLocale: "en",
          queryLocale: "en",
          queryInterpretation: "glasses",
          searchTerms: ["glasses"],
        },
      }),
    });
  });

  await page.goto("/");
  const searchInput = page.getByRole("combobox", { name: "Search query" });
  await searchInput.fill("glasses");
  await searchInput.press("Enter");
  await page.getByRole("button", { name: "Red Glass" }).click();
  return page.getByRole("dialog", { name: "Red Glass" });
}

test("opens a product preview sheet from a search result", async ({ page }) => {
  const preview = await openRedGlassPreview(page);
  await expect(preview).toBeVisible();
  await expect(preview.getByText("A stemmed tasting glass.")).toBeVisible();
  await expect(preview.getByText("SKU GLASS-RED")).toBeVisible();
  await expect(preview.getByRole("button", { name: "Close" })).toBeFocused();

  await preview.getByRole("button", { name: "Close" }).click();
  await expect(preview).toBeHidden();
  await expect(page.getByRole("button", { name: "Red Glass" })).toBeFocused();
});

test("adds the previewed product to the cart with a chosen quantity", async ({ page }) => {
  let addedToCart = false;
  const updatedCart = {
    id: "cart-1",
    version: 2,
    anonymousId: "anon-1",
    lineItems: [
      {
        id: "li-1",
        name: "Red Glass",
        sku: "GLASS-RED",
        productId: "glass",
        quantity: 2,
        price: { amount: 24, currency: "EUR", formatted: "€24.00" },
        totalPrice: { amount: 48, currency: "EUR", formatted: "€48.00" },
      },
    ],
    totalPrice: { amount: 48, currency: "EUR", formatted: "€48.00" },
    totalQuantity: 2,
  };

  await page.route(
    (url) => url.pathname.startsWith("/api/commerce-ai/cart"),
    async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.url().includes("/cart/add")) {
        addedToCart = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ cart: updatedCart }),
        });
        return;
      }
      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ cart: addedToCart ? updatedCart : null }),
        });
        return;
      }
      await route.continue();
    },
  );

  const preview = await openRedGlassPreview(page);
  await expect(preview.getByRole("button", { name: "Add to cart · €24.00" })).toBeVisible();

  await preview.getByRole("button", { name: "Increase quantity" }).click();
  const addButton = preview.getByRole("button", { name: "Add to cart · €48.00" });
  await expect(addButton).toBeVisible();

  const [addRequest] = await Promise.all([
    page.waitForRequest(
      (request) => request.url().includes("/cart/add") && request.method() === "POST",
    ),
    addButton.click(),
  ]);
  expect(await addRequest.postDataJSON()).toMatchObject({ sku: "GLASS-RED", quantity: 2 });
  await expect(preview.getByText("Added 2 items to your cart.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Shopping cart (2)" })).toBeVisible();

  await preview.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Shopping cart (2)" }).click();

  const cartPanel = page.locator(".cat-cart-panel");
  await expect(cartPanel.getByText("Red Glass")).toBeVisible();
  await expect(cartPanel.locator(".cat-cart-panel__total strong")).toHaveText("€48.00");
});

test("closes the product preview with Escape and restores focus", async ({ page }) => {
  const preview = await openRedGlassPreview(page);
  await expect(preview).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
  await expect(page.getByRole("button", { name: "Red Glass" })).toBeFocused();
});

test("closes the product preview from the backdrop", async ({ page }) => {
  const preview = await openRedGlassPreview(page);
  await expect(preview).toBeVisible();

  await preview.click({ position: { x: 8, y: 8 } });
  await expect(preview).toBeHidden();
});
