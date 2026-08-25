import { expect, test, type Page } from "@playwright/test";

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

async function mockCheckoutApi(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("commerce-ai-tool:anonymousId", "anon-e2e");
  });
  await page.route("**/api/commerce-ai/cart**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = { cart };

    if (path.endsWith("/shipping-methods")) {
      body = {
        shippingMethods: [
          {
            id: "shipping-1",
            name: "Standard delivery",
            description: "Delivery in 3–5 days",
          },
        ],
      };
    } else if (path.endsWith("/shipping-method")) {
      body = {
        cart: {
          ...cart,
          shippingMethod: { id: "shipping-1", name: "Standard delivery" },
        },
      };
    } else if (path.endsWith("/order")) {
      body = {
        order: {
          id: "order-1",
          orderNumber: "cat-e2e-1",
          orderState: "Open",
          totalPrice: cart.totalPrice,
          lineItems: cart.lineItems,
        },
      };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

test("completes the host-owned checkout flow", async ({ page }) => {
  await mockCheckoutApi(page);
  await page.goto("/");

  await page.getByRole("button", { name: /cart/i }).click();
  await expect(page.getByRole("button", { name: "Sign in to sync your cart" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeHidden();
  const itemListBox = await page.locator(".cat-cart-panel__items").boundingBox();
  expect(itemListBox?.height).toBeLessThan(150);
  const panelBox = await page.locator(".cat-cart-panel").boundingBox();
  const checkoutButtonBox = await page.getByRole("button", { name: "Checkout" }).boundingBox();
  expect(checkoutButtonBox!.width).toBeLessThan(panelBox!.width * 0.6);
  await page.getByRole("button", { name: "Checkout" }).click();
  await expect(page).toHaveURL(/\/checkout$/);

  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Lovelace");
  await page.getByLabel("Street address").fill("Main Street");
  await page.getByLabel("Postal code").fill("10115");
  await page.getByLabel("City").fill("Berlin");
  await page.getByRole("button", { name: "Continue to delivery" }).click();
  await page.getByRole("button", { name: /Standard delivery/ }).click();
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page.getByRole("heading", { name: "Order placed" })).toBeVisible();
  await expect(page.getByText("cat-e2e-1")).toBeVisible();
});

test("stacks checkout sections and keeps the order action sticky on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockCheckoutApi(page);
  await page.goto("/checkout");

  const layout = page.locator(".cat-checkout__layout");
  await expect(layout).toBeVisible();
  expect(await layout.evaluate((element) => getComputedStyle(element).gridTemplateColumns))
    .not.toContain(" ");
  await expect(page.locator(".cat-checkout__place-island")).toHaveCSS("position", "sticky");
});

test("opens the cart as a full-screen sheet on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockCheckoutApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: /cart/i }).click();

  const panel = page.locator(".cat-cart-panel");
  await expect(panel).toHaveCSS("position", "fixed");
  await expect.poll(async () => (await panel.boundingBox())?.width).toBe(375);
  await expect.poll(async () => (await panel.boundingBox())?.height).toBe(812);
});

test("keeps the wallpaper and search layout stable when the cart opens", async ({ page }) => {
  await page.setViewportSize({ width: 968, height: 784 });
  await mockCheckoutApi(page);
  await page.goto("/");

  const hero = page.locator(".demo-hero");
  const searchBar = page.locator(".cat-search-bar");
  const heroBefore = await hero.boundingBox();
  const searchBefore = await searchBar.boundingBox();

  expect(
    await page.evaluate(() => getComputedStyle(document.body, "::before").position),
  ).toBe("fixed");

  await page.getByRole("button", { name: /cart/i }).click();

  expect((await hero.boundingBox())?.y).toBe(heroBefore?.y);
  expect((await searchBar.boundingBox())?.y).toBe(searchBefore?.y);
});
