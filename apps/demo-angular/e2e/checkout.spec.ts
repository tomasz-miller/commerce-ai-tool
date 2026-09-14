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

    if (path.endsWith("/payment-methods")) {
      body = {
        paymentMethods: [
          {
            method: "CREDIT_CARD",
            name: "Credit card",
            description: "Demo authorization — no real charge",
          },
        ],
      };
    } else if (path.endsWith("/payment")) {
      body = {
        payment: {
          id: "pay-1",
          paymentInterface: "MOCK",
          method: "CREDIT_CARD",
          status: "authorized",
          amount: cart.totalPrice,
        },
        cart,
      };
    } else if (path.endsWith("/shipping-methods")) {
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
          paymentState: "Paid",
          shipmentState: "Ready",
          totalPrice: cart.totalPrice,
          lineItems: cart.lineItems,
          shippingAddress: {
            firstName: "Ada",
            lastName: "Lovelace",
            streetName: "Main Street",
            postalCode: "10115",
            city: "Berlin",
            country: "DE",
          },
        },
      };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.route("**/api/commerce-ai/orders**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        order: {
          id: "order-1",
          orderNumber: "cat-e2e-1",
          orderState: "Open",
          paymentState: "Paid",
          shipmentState: "Shipped",
          totalPrice: cart.totalPrice,
          lineItems: cart.lineItems,
          shippingAddress: {
            firstName: "Ada",
            lastName: "Lovelace",
            streetName: "Main Street",
            postalCode: "10115",
            city: "Berlin",
            country: "DE",
          },
          deliveries: [{ id: "parcel-1", trackingId: "DHL-123", carrier: "DHL" }],
        },
      }),
    });
  });
}

test("completes the host-owned checkout flow", async ({ page }) => {
  await mockCheckoutApi(page);
  await page.goto("/checkout");

  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Lovelace");
  await page.getByLabel("Street").fill("Main Street");
  await page.getByLabel("Postal code").fill("10115");
  await page.getByLabel("City").fill("Berlin");
  await page.getByRole("button", { name: "Continue to delivery" }).click();
  await page.getByRole("button", { name: /Standard delivery/ }).click();
  await page.getByRole("button", { name: /Credit card/ }).click();
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page).toHaveURL(/\/orders\?orderNumber=cat-e2e-1/);
  await expect(page.getByRole("heading", { name: "cat-e2e-1" })).toBeVisible();
  await expect(page.getByText("DHL-123")).toBeVisible();
});
