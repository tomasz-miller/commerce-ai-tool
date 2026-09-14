import { expect, test, type Page } from "@playwright/test";

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
        meta: {
          total: 1,
          limit: 20,
          offset: 0,
          locale: "en-GB",
          catalogLocale: "en-GB",
          queryLocale: "en",
        },
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
