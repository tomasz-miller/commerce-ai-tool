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
