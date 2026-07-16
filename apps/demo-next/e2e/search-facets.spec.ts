import { expect, test } from "@playwright/test";

test("refines AI-suggested facets without a second AI search", async ({ page }) => {
  let refined = false;
  let sentSuggestedFacets = false;

  await page.route("**/api/commerce-ai/search", async (route) => {
    const body = route.request().postDataJSON() as {
      filters?: Record<string, string>;
      searchTerms?: string[];
      suggestedFacets?: Array<{ name: string }>;
    };
    refined = body.filters?.color === "red";
    sentSuggestedFacets = body.suggestedFacets?.some((facet) => facet.name === "color") === true;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        products: [
          {
            id: refined ? "red-glass" : "glass",
            name: refined ? "Red Glass" : "Glass",
          },
        ],
        facets: [
          {
            id: "color",
            label: "Color",
            type: "distinct",
            buckets: [{ key: "red", label: "red", count: 1 }],
          },
        ],
        suggestedFacets: [{ name: "color", reason: "Useful distinction" }],
        meta: {
          total: 1,
          limit: 20,
          offset: 0,
          locale: "en",
          catalogLocale: "en",
          queryLocale: "en",
          queryInterpretation: "glasses",
          searchTerms: ["glasses"],
          appliedFilters: body.filters ?? {},
          schemaEtag: "facet-test",
        },
      }),
    });
  });

  await page.goto("/");
  const searchInput = page.getByRole("combobox", { name: "Search query" });
  await searchInput.fill("glasses");
  await searchInput.press("Enter");

  await expect(page.getByRole("group", { name: "Color" })).toBeVisible();
  await page.getByRole("button", { name: "red" }).click();

  await expect(page.getByRole("option", { name: "Red Glass" })).toBeVisible();
  expect(refined).toBe(true);
  expect(sentSuggestedFacets).toBe(true);
  await expect(page.getByRole("button", { name: "New search" })).toBeVisible();
});
