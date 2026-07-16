import { expect, test } from "@playwright/test";

test("autocomplete selects a suggestion and shows search results", async ({ page }) => {
  await page.route("**/api/commerce-ai/search/suggestions", async (route) => {
    const body = route.request().postDataJSON() as { query?: string };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        suggestions: body.query?.startsWith("re") ? ["Red Shoes", "Running Shoes"] : [],
      }),
    });
  });

  await page.route("**/api/commerce-ai/search", async (route) => {
    const body = route.request().postDataJSON() as { query?: string };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        products: [
          {
            id: "p1",
            name: body.query ?? "Red Shoes",
            price: {
              amount: 99,
              currency: "EUR",
              formatted: "€99.00",
            },
          },
        ],
        meta: {
          total: 1,
          limit: 20,
          offset: 0,
          locale: "en",
          catalogLocale: "en",
          queryLocale: "en",
          queryInterpretation: body.query,
        },
      }),
    });
  });

  await page.goto("/");

  const searchInput = page.getByRole("combobox", { name: "Search query" });
  await searchInput.fill("re");

  const suggestions = page.getByRole("listbox", { name: "Search suggestions" });
  await expect(suggestions).toBeVisible();
  await expect(suggestions.getByRole("option", { name: "Red Shoes" })).toBeVisible();

  await suggestions.getByRole("option", { name: "Red Shoes" }).click();

  const results = page.getByRole("listbox", { name: "Search results" });
  await expect(results).toBeVisible();
  await expect(results.getByRole("option", { name: "Red Shoes" })).toBeVisible();
});
