import { expect, test, type Page } from "@playwright/test";

const missionResponse = {
  products: [
    { id: "g1", name: "Stout Beer Glass", sku: "GLASS-1", price: { amount: 57, currency: "EUR", formatted: "€56.99" } },
    { id: "g2", name: "Harmony Drinking Glass", sku: "GLASS-2", price: { amount: 25, currency: "EUR", formatted: "€24.99" } },
    { id: "t1", name: "Modern Gold Coffee Table", sku: "TABLE-1", price: { amount: 260, currency: "EUR", formatted: "€259.99" } },
    { id: "t2", name: "Walnut Side Table", sku: "TABLE-2", price: { amount: 180, currency: "EUR", formatted: "€179.99" } },
  ],
  mission: {
    interpretation: "The user is looking for glasses and a table suitable for a living room.",
    intents: [
      {
        intent: { id: "intent-0", label: "glasses", quantity: 1, searchTerms: ["glasses"] },
        products: [
          { id: "g1", name: "Stout Beer Glass", sku: "GLASS-1", price: { amount: 57, currency: "EUR", formatted: "€56.99" } },
          { id: "g2", name: "Harmony Drinking Glass", sku: "GLASS-2", price: { amount: 25, currency: "EUR", formatted: "€24.99" } },
        ],
        total: 2,
      },
      {
        intent: { id: "intent-1", label: "living room table", quantity: 1, searchTerms: ["living room table"] },
        products: [
          { id: "t1", name: "Modern Gold Coffee Table", sku: "TABLE-1", price: { amount: 260, currency: "EUR", formatted: "€259.99" } },
          { id: "t2", name: "Walnut Side Table", sku: "TABLE-2", price: { amount: 180, currency: "EUR", formatted: "€179.99" } },
        ],
        total: 2,
      },
    ],
  },
  meta: {
    total: 4,
    limit: 4,
    offset: 0,
    locale: "en",
    catalogLocale: "en",
    queryLocale: "en",
    queryInterpretation: "glasses and a living room table",
    searchTerms: ["glasses", "living room table"],
  },
};

async function mockMissionSearch(page: Page, response = missionResponse) {
  await page.route("**/api/commerce-ai/search/suggestions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ suggestions: [] }),
    });
  });

  await page.route("**/api/commerce-ai/search", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });

  await page.route("**/api/commerce-ai/cart**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        cart: {
          id: "cart-mission",
          version: 1,
          lineItems: [],
          totalPrice: { amount: 0, currency: "EUR", formatted: "€0.00" },
          totalQuantity: 0,
        },
      }),
    });
  });
}

async function runMissionSearch(page: Page) {
  const searchInput = page.getByRole("combobox", { name: "Search query" });
  await searchInput.fill("I'm looking for some glasses and table for my living room.");
  await searchInput.press("Enter");
  await expect(page.locator(".cat-root--mission")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shopping list" })).toBeVisible();
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflowed = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflowed).toBe(false);
}

test("keeps the demo header above a bounded search stage at 1440px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockMissionSearch(page);
  await page.goto("/");
  await runMissionSearch(page);

  const hero = page.locator(".demo-hero");
  const widget = page.locator(".cat-root");
  const searchShell = page.locator(".cat-search-shell");
  const mission = page.locator(".cat-mission");

  const heroBox = await hero.boundingBox();
  const widgetBox = await widget.boundingBox();
  const searchBox = await searchShell.boundingBox();
  const missionBox = await mission.boundingBox();

  expect(heroBox).toBeTruthy();
  expect(widgetBox).toBeTruthy();
  expect(searchBox).toBeTruthy();
  expect(missionBox).toBeTruthy();
  expect(heroBox!.y + heroBox!.height).toBeLessThanOrEqual(widgetBox!.y + 1);
  expect(searchBox!.width).toBeLessThanOrEqual(48 * 16 + 1);
  expect(missionBox!.width).toBeLessThanOrEqual(48 * 16 + 1);
  expect(Math.abs(searchBox!.width - missionBox!.width)).toBeLessThan(48);

  const groups = page.locator(".cat-mission-group");
  await expect(groups).toHaveCount(2);
  const first = await groups.nth(0).boundingBox();
  const second = await groups.nth(1).boundingBox();
  expect(Math.abs((first?.y ?? 0) - (second?.y ?? 0))).toBeLessThan(24);
  expect(first!.width).toBeLessThan(28 * 16);

  const addAll = page.locator(".cat-mission__add-all");
  const addBox = await addAll.boundingBox();
  expect(addBox).toBeTruthy();
  expect(missionBox!.x + missionBox!.width - (addBox!.x + addBox!.width)).toBeGreaterThanOrEqual(10);

  const primaryBox = await page.locator(".cat-result-card--primary").first().boundingBox();
  const compactBox = await page.locator(".cat-result-card--compact").first().boundingBox();
  const primaryImage = await page.locator(".cat-result-card--primary .cat-result-image").first().boundingBox();
  expect(primaryBox!.height).toBeGreaterThan(compactBox!.height);
  expect(primaryBox!.height).toBeLessThan(320);
  expect(primaryImage!.height / primaryImage!.width).toBeGreaterThan(0.45);

  await assertNoHorizontalOverflow(page);
});

test("does not crush the header or stretch search at 1024px", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await mockMissionSearch(page);
  await page.goto("/");
  await runMissionSearch(page);

  const hero = page.locator(".demo-hero");
  const widget = page.locator(".cat-root");
  const searchShell = page.locator(".cat-search-shell");
  const mission = page.locator(".cat-mission");

  const heroBox = await hero.boundingBox();
  const widgetBox = await widget.boundingBox();
  const searchBox = await searchShell.boundingBox();
  const missionBox = await mission.boundingBox();

  expect(heroBox!.width).toBeGreaterThan(280);
  expect(heroBox!.y + heroBox!.height).toBeLessThanOrEqual(widgetBox!.y + 1);
  expect(Math.abs(searchBox!.width - missionBox!.width)).toBeLessThan(48);
  expect(missionBox!.width).toBeLessThanOrEqual(48 * 16 + 1);
  await assertNoHorizontalOverflow(page);
});

test("stacks mission lanes and wraps search actions at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockMissionSearch(page);
  await page.goto("/");
  await runMissionSearch(page);

  const groups = page.locator(".cat-mission-group");
  const first = await groups.nth(0).boundingBox();
  const second = await groups.nth(1).boundingBox();
  expect(second!.y).toBeGreaterThan((first!.y ?? 0) + (first!.height ?? 0) - 8);

  const input = page.getByRole("combobox", { name: "Search query" });
  const actions = page.locator(".cat-search-actions");
  const inputBox = await input.boundingBox();
  const actionsBox = await actions.boundingBox();
  expect(actionsBox!.y).toBeGreaterThan((inputBox!.y ?? 0) + 8);

  const searchBox = await page.locator(".cat-search-shell").boundingBox();
  const missionBox = await page.locator(".cat-mission").boundingBox();
  expect(Math.abs((searchBox?.width ?? 0) - (missionBox?.width ?? 0))).toBeLessThan(48);

  await assertNoHorizontalOverflow(page);
});

test("grows the mission canvas when three lanes are present", async ({ page }) => {
  const threeLaneResponse = {
    ...missionResponse,
    products: [
      ...missionResponse.products,
      { id: "c1", name: "Rumi Chair", sku: "CHAIR-1", price: { amount: 130, currency: "EUR", formatted: "€129.99" } },
    ],
    mission: {
      ...missionResponse.mission,
      intents: [
        ...missionResponse.mission.intents,
        {
          intent: { id: "intent-2", label: "chairs", quantity: 1, searchTerms: ["chairs"] },
          products: [
            { id: "c1", name: "Rumi Chair", sku: "CHAIR-1", price: { amount: 130, currency: "EUR", formatted: "€129.99" } },
          ],
          total: 1,
        },
      ],
    },
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await mockMissionSearch(page, threeLaneResponse);
  await page.goto("/");
  await runMissionSearch(page);

  await expect(page.locator(".cat-root--mission-lanes-3")).toBeVisible();
  const searchBox = await page.locator(".cat-search-shell").boundingBox();
  const missionBox = await page.locator(".cat-mission").boundingBox();
  expect(missionBox!.width).toBeGreaterThan(searchBox!.width + 80);
  expect(missionBox!.width).toBeGreaterThan(56 * 16);
  expect(missionBox!.width).toBeLessThanOrEqual(72 * 16 + 1);
  await expect(page.locator(".cat-mission-group")).toHaveCount(3);
  await assertNoHorizontalOverflow(page);
});
