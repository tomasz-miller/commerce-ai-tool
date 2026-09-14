import { expect, test, type Page } from "@playwright/test";

const order = {
  id: "order-1",
  orderNumber: "cat-e2e-1",
  orderState: "Open",
  paymentState: "Paid",
  shipmentState: "Shipped",
  createdAt: "2026-09-10T13:41:00.000Z",
  totalPrice: { amount: 99, currency: "EUR", formatted: "€99.00" },
  lineItems: [
    {
      id: "line-1",
      name: "Running shoe",
      productId: "product-1",
      quantity: 1,
      price: { amount: 99, currency: "EUR", formatted: "€99.00" },
      totalPrice: { amount: 99, currency: "EUR", formatted: "€99.00" },
    },
  ],
  shippingAddress: {
    firstName: "Ada",
    lastName: "Lovelace",
    streetName: "Main Street",
    postalCode: "10115",
    city: "Berlin",
    country: "DE",
  },
  deliveries: [{ id: "parcel-1", trackingId: "DHL-123", carrier: "DHL" }],
};

async function mockOrdersApi(page: Page, body: unknown) {
  await page.addInitScript(() => {
    localStorage.setItem("commerce-ai-tool:anonymousId", "anon-e2e");
  });
  await page.route("**/api/commerce-ai/cart**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ cart: null }),
    });
  });
  await page.route("**/api/commerce-ai/orders**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

test("lists recent orders and opens the confirmation", async ({ page }) => {
  await mockOrdersApi(page, { orders: [order] });
  await page.goto("/orders");

  await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
  await page.getByRole("link", { name: /cat-e2e-1/ }).click();
  await expect(page).toHaveURL(/\/orders\?orderNumber=cat-e2e-1/);
});

test("shows the confirmation with tracking for an order number", async ({ page }) => {
  await mockOrdersApi(page, { order });
  await page.goto("/orders?orderNumber=cat-e2e-1");

  await expect(page.getByRole("heading", { name: "cat-e2e-1" })).toBeVisible();
  await expect(page.getByText("DHL-123")).toBeVisible();
  await expect(page.getByText(/Ada Lovelace/)).toBeVisible();
});

test("reports an unknown order number", async ({ page }) => {
  await mockOrdersApi(page, { order: null });
  await page.goto("/orders?orderNumber=cat-missing");

  await expect(page.getByRole("heading", { name: "Order not found" })).toBeVisible();
});
