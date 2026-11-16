import { describe, expect, it, vi } from "vitest";
import type { Cart, Payment } from "@commercetools/platform-sdk";
import type { PaymentProvider } from "../payments/types.js";
import { CheckoutIncompleteError } from "./checkout.js";
import {
  createPaymentKey,
  createPaymentOperations,
  PaymentDeclinedError,
  PaymentNotConfiguredError,
  type PaymentGateway,
} from "./payment.js";
import { CountryNotAllowedError, CurrencyMismatchError } from "./checkout.js";

function money(centAmount: number) {
  return {
    type: "centPrecision" as const,
    centAmount,
    currencyCode: "EUR",
    fractionDigits: 2,
  };
}

function cart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: "cart-1",
    version: 4,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastModifiedAt: "2026-01-01T00:00:00.000Z",
    lineItems: [
      {
        id: "line-1",
        productId: "product-1",
        name: { en: "Running shoe" },
        productType: { typeId: "product-type", id: "type-1" },
        variant: { id: 1, sku: "RUN-1" },
        price: { id: "price-1", value: money(9900) },
        quantity: 1,
        totalPrice: money(9900),
      },
    ],
    customLineItems: [],
    totalPrice: money(9900),
    taxMode: "Platform",
    taxRoundingMode: "HalfEven",
    taxCalculationMode: "LineItemLevel",
    inventoryMode: "None",
    cartState: "Active",
    shippingMode: "Single",
    shipping: [],
    itemShippingAddresses: [],
    discountTypeCombination: { type: "Stacking" },
    refusedGifts: [],
    origin: "Customer",
    anonymousId: "anon-1",
    ...overrides,
  } as Cart;
}

function paymentResource(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pay-1",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastModifiedAt: "2026-01-01T00:00:00.000Z",
    key: "cat-1-cart-1-MOCK",
    interfaceId: "psp-1",
    amountPlanned: money(9900),
    paymentMethodInfo: { paymentInterface: "MOCK", method: "CREDIT_CARD" },
    paymentStatus: {},
    anonymousId: "anon-1",
    transactions: [
      {
        id: "tx-1",
        type: "Authorization",
        amount: money(9900),
        state: "Success",
      },
    ],
    interfaceInteractions: [],
    ...overrides,
  } as Payment;
}

const notFound = { statusCode: 404, body: { statusCode: 404, errors: [{ code: "ResourceNotFound" }] } };

function gateway(overrides: Partial<PaymentGateway> = {}): PaymentGateway {
  return {
    queryCarts: vi.fn().mockResolvedValue([cart()]),
    getCartById: vi.fn().mockResolvedValue(cart()),
    updateCart: vi.fn().mockResolvedValue(cart({ version: 5 })),
    getShippingMethodsMatchingCart: vi.fn().mockResolvedValue([]),
    createOrderFromCart: vi.fn(),
    createPayment: vi.fn().mockResolvedValue(paymentResource()),
    getPaymentById: vi.fn().mockResolvedValue(paymentResource()),
    getPaymentByKey: vi.fn().mockRejectedValue(notFound),
    ...overrides,
  };
}

function provider(overrides: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    paymentInterface: "MOCK",
    listMethods: vi.fn().mockResolvedValue([
      { method: "CREDIT_CARD", name: "Credit card" },
    ]),
    authorize: vi.fn().mockResolvedValue({
      status: "authorized",
      interfaceId: "psp-1",
    }),
    ...overrides,
  };
}

const shippingAddress = {
  firstName: "Ada",
  lastName: "Lovelace",
  streetName: "Main Street",
  postalCode: "10115",
  city: "Berlin",
  country: "DE",
};

describe("createPaymentOperations shipping scope", () => {
  it("authorizePayment re-applies the shipping country before computing the amount", async () => {
    // An add after the address step flipped cart.country back to PL.
    const stale = cart({ country: "PL", shippingAddress });
    const repriced = cart({
      version: 5,
      country: "DE",
      shippingAddress,
      totalPrice: money(12000),
    });
    const api = gateway({
      queryCarts: vi.fn().mockResolvedValue([stale]),
      updateCart: vi.fn().mockResolvedValueOnce(repriced).mockResolvedValue(cart({ version: 6 })),
    });
    const psp = provider();
    const payments = createPaymentOperations(api, psp);

    await payments.authorizePayment({ anonymousId: "anon-1", method: "CREDIT_CARD" });

    expect(vi.mocked(api.updateCart).mock.calls[0]).toEqual([
      "cart-1",
      4,
      [{ action: "setCountry", country: "DE" }],
    ]);
    expect(psp.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: { centAmount: 12000, currencyCode: "EUR" },
        country: "DE",
      }),
    );
    expect(api.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountPlanned: { centAmount: 12000, currencyCode: "EUR" } }),
    );
  });

  it("authorizePayment computes the amount from the version reconciled after a 409", async () => {
    const austria = { ...shippingAddress, country: "AT" };
    const stale = cart({ country: "PL", shippingAddress });
    const latest = cart({ version: 5, country: "PL", shippingAddress: austria });
    const reconciled = cart({
      version: 6,
      country: "AT",
      shippingAddress: austria,
      totalPrice: money(11000),
    });
    const api = gateway({
      queryCarts: vi.fn().mockResolvedValue([stale]),
      getCartById: vi.fn().mockResolvedValue(latest),
      updateCart: vi
        .fn()
        .mockRejectedValueOnce({ statusCode: 409 })
        .mockResolvedValueOnce(reconciled)
        .mockResolvedValue(cart({ version: 7 })),
    });
    const psp = provider();

    await createPaymentOperations(api, psp).authorizePayment({
      anonymousId: "anon-1",
      method: "CREDIT_CARD",
    });

    expect(vi.mocked(api.updateCart).mock.calls[1]).toEqual([
      "cart-1",
      5,
      [{ action: "setCountry", country: "AT" }],
    ]);
    expect(psp.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ amount: { centAmount: 11000, currencyCode: "EUR" }, country: "AT" }),
    );
  });

  it("authorizePayment rejects a currency mismatch or a disallowed shipping country", async () => {
    const swiss = { ...shippingAddress, country: "CH" };
    const api = gateway({
      queryCarts: vi.fn().mockResolvedValue([cart({ country: "CH", shippingAddress: swiss })]),
    });
    const psp = provider();

    await expect(
      createPaymentOperations(api, psp, { currencyByCountry: { CH: "CHF" } }).authorizePayment({
        anonymousId: "anon-1",
        method: "CREDIT_CARD",
      }),
    ).rejects.toBeInstanceOf(CurrencyMismatchError);
    await expect(
      createPaymentOperations(api, psp, { allowedCountries: ["DE"] }).authorizePayment({
        anonymousId: "anon-1",
        method: "CREDIT_CARD",
      }),
    ).rejects.toBeInstanceOf(CountryNotAllowedError);
    expect(psp.authorize).not.toHaveBeenCalled();
  });
});

describe("createPaymentOperations", () => {
  it("creates a PaymentDraft with a cart-scoped key and links it to the cart", async () => {
    const api = gateway();
    const psp = provider();
    const payments = createPaymentOperations(api, psp);

    const result = await payments.authorizePayment({
      anonymousId: "anon-1",
      method: "CREDIT_CARD",
      orderNumber: "cat-1",
    });

    expect(psp.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        cartId: "cart-1",
        orderNumber: "cat-1",
        method: "CREDIT_CARD",
        amount: { centAmount: 9900, currencyCode: "EUR" },
      }),
    );
    expect(api.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "cat-1-cart-1-MOCK",
        interfaceId: "psp-1",
        anonymousId: "anon-1",
        paymentMethodInfo: { paymentInterface: "MOCK", method: "CREDIT_CARD" },
        transactions: [
          expect.objectContaining({
            type: "Authorization",
            state: "Success",
            interactionId: "psp-1",
          }),
        ],
      }),
    );
    expect(vi.mocked(api.createPayment).mock.calls[0]?.[0].customer).toBeUndefined();
    expect(api.updateCart).toHaveBeenCalledWith("cart-1", 4, [
      { action: "addPayment", payment: { typeId: "payment", id: "pay-1" } },
    ]);
    expect(result.payment).toMatchObject({
      id: "pay-1",
      method: "CREDIT_CARD",
      status: "authorized",
    });
  });

  it("does not put a consumed anonymousId on a customer Payment", async () => {
    const customerCart = cart({ customerId: "cust-1", anonymousId: "anon-1" });
    const api = gateway({
      queryCarts: vi.fn().mockResolvedValue([customerCart]),
    });
    const payments = createPaymentOperations(api, provider());

    await payments.authorizePayment({
      customerId: "cust-1",
      method: "CREDIT_CARD",
      orderNumber: "cat-1",
    });

    expect(api.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: { typeId: "customer", id: "cust-1" },
      }),
    );
    expect(vi.mocked(api.createPayment).mock.calls[0]?.[0].anonymousId).toBeUndefined();
  });

  it("retries Payment create without anonymousId when commercetools consumed it at login", async () => {
    const used = {
      statusCode: 400,
      message: "The anonymousId 'anon-1' was already used for sign-in or sign-up.",
      body: {
        statusCode: 400,
        message: "The anonymousId 'anon-1' was already used for sign-in or sign-up.",
      },
    };
    const api = gateway({
      createPayment: vi
        .fn()
        .mockRejectedValueOnce(used)
        .mockResolvedValueOnce(paymentResource({ anonymousId: undefined })),
    });
    const payments = createPaymentOperations(api, provider());

    await payments.authorizePayment({
      anonymousId: "anon-1",
      method: "CREDIT_CARD",
      orderNumber: "cat-1",
    });

    expect(api.createPayment).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.createPayment).mock.calls[0]?.[0].anonymousId).toBe("anon-1");
    expect(vi.mocked(api.createPayment).mock.calls[1]?.[0].anonymousId).toBeUndefined();
  });

  it("skips the PSP when the cart already has a matching successful payment", async () => {
    const existing = paymentResource();
    const linked = cart({
      paymentInfo: {
        payments: [{ typeId: "payment", id: existing.id, obj: existing }],
      },
    });
    const api = gateway({
      queryCarts: vi.fn().mockResolvedValue([linked]),
    });
    const psp = provider();
    const payments = createPaymentOperations(api, psp);

    const result = await payments.authorizePayment({
      anonymousId: "anon-1",
      method: "CREDIT_CARD",
      orderNumber: "cat-1",
    });

    expect(psp.authorize).not.toHaveBeenCalled();
    expect(api.createPayment).not.toHaveBeenCalled();
    expect(result.payment.status).toBe("authorized");
  });

  it("skips the PSP when an owned payment key already covers the cart total", async () => {
    const existing = paymentResource();
    const api = gateway({
      getPaymentByKey: vi.fn().mockResolvedValue(existing),
    });
    const psp = provider();
    const payments = createPaymentOperations(api, psp);

    await payments.authorizePayment({
      anonymousId: "anon-1",
      method: "CREDIT_CARD",
      orderNumber: "cat-1",
    });

    expect(psp.authorize).not.toHaveBeenCalled();
    expect(api.createPayment).not.toHaveBeenCalled();
    expect(api.updateCart).toHaveBeenCalled();
  });

  it("does not reuse a payment owned by another cart", async () => {
    const foreign = paymentResource({ anonymousId: "other-anon", customer: undefined });
    const api = gateway({
      getPaymentByKey: vi.fn().mockImplementation(async (key: string) => {
        if (key === "cat-1-cart-1-MOCK") {
          return foreign;
        }
        throw notFound;
      }),
    });
    const psp = provider();
    const payments = createPaymentOperations(api, psp);

    await payments.authorizePayment({
      anonymousId: "anon-1",
      method: "CREDIT_CARD",
      orderNumber: "cat-1",
    });

    expect(psp.authorize).toHaveBeenCalledOnce();
    expect(api.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ key: "cat-1-cart-1-MOCK-2" }),
    );
  });

  it("uses a new key after a declined payment instead of reusing the failure", async () => {
    const failed = paymentResource({
      id: "pay-fail",
      transactions: [
        {
          id: "tx-fail",
          type: "Authorization",
          amount: money(9900),
          state: "Failure",
        },
      ],
    });
    let attempt = 0;
    const api = gateway({
      getPaymentByKey: vi.fn().mockImplementation(async (key: string) => {
        if (key === "cat-1-cart-1-MOCK") {
          return failed;
        }
        throw notFound;
      }),
      createPayment: vi.fn().mockImplementation(async () =>
        paymentResource({ id: "pay-2", key: "cat-1-cart-1-MOCK-2" }),
      ),
      queryCarts: vi.fn().mockResolvedValue([
        cart({
          paymentInfo: { payments: [{ typeId: "payment", id: "pay-fail", obj: failed }] },
        }),
      ]),
    });
    const psp = provider({
      authorize: vi.fn().mockImplementation(async () => {
        attempt += 1;
        return { status: "authorized" as const, interfaceId: `psp-${attempt}` };
      }),
    });
    const payments = createPaymentOperations(api, psp);

    await payments.authorizePayment({
      anonymousId: "anon-1",
      method: "CREDIT_CARD",
      orderNumber: "cat-1",
    });

    expect(psp.authorize).toHaveBeenCalledOnce();
    expect(api.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ key: "cat-1-cart-1-MOCK-2" }),
    );
  });

  it("still records a failed Payment then throws PaymentDeclinedError", async () => {
    const api = gateway({
      createPayment: vi.fn().mockResolvedValue(
        paymentResource({
          transactions: [
            {
              id: "tx-1",
              type: "Authorization",
              amount: money(9900),
              state: "Failure",
            },
          ],
        }),
      ),
    });
    const payments = createPaymentOperations(
      api,
      provider({
        authorize: vi.fn().mockResolvedValue({
          status: "failed",
          failureReason: "Insufficient funds",
        }),
      }),
    );

    await expect(
      payments.authorizePayment({
        anonymousId: "anon-1",
        method: "CREDIT_CARD",
        orderNumber: "cat-1",
      }),
    ).rejects.toEqual(new PaymentDeclinedError("Insufficient funds"));
    expect(api.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        transactions: [expect.objectContaining({ state: "Failure" })],
      }),
    );
    expect(api.updateCart).toHaveBeenCalled();
  });

  it("does not add a payment that is already on the cart", async () => {
    const existing = paymentResource();
    const linked = cart({
      paymentInfo: { payments: [{ typeId: "payment", id: "pay-1", obj: existing }] },
    });
    const api = gateway({
      queryCarts: vi.fn().mockResolvedValue([linked]),
    });
    const payments = createPaymentOperations(api, provider());

    await payments.authorizePayment({
      anonymousId: "anon-1",
      method: "CREDIT_CARD",
      orderNumber: "cat-1",
    });

    expect(api.updateCart).not.toHaveBeenCalled();
  });

  it("rejects an empty cart before calling the PSP", async () => {
    const api = gateway({
      queryCarts: vi.fn().mockResolvedValue([cart({ lineItems: [], totalPrice: money(0) })]),
    });
    const psp = provider();
    const payments = createPaymentOperations(api, psp);

    await expect(
      payments.authorizePayment({ anonymousId: "anon-1", method: "CREDIT_CARD" }),
    ).rejects.toBeInstanceOf(CheckoutIncompleteError);
    expect(psp.authorize).not.toHaveBeenCalled();
  });

  it("returns no methods and rejects authorize when no provider is configured", async () => {
    const payments = createPaymentOperations(gateway());

    await expect(payments.listPaymentMethods({ locale: "en" })).resolves.toEqual([]);
    await expect(
      payments.authorizePayment({ anonymousId: "anon-1", method: "CREDIT_CARD" }),
    ).rejects.toBeInstanceOf(PaymentNotConfiguredError);
  });

  it("builds a commercetools-safe payment key scoped to the cart", () => {
    expect(createPaymentKey("cat-1", "MOCK", "cart-1")).toBe("cat-1-cart-1-MOCK");
    expect(createPaymentKey("cat-1", "Stripe*Live", "cart-1", 2)).toBe(
      "cat-1-cart-1-StripeLive-2",
    );
  });

  it("sanitises the order number in the payment key like the other parts", () => {
    expect(createPaymentKey('x" or 1=1', "MOCK", "cart-1")).toBe("xor11-cart-1-MOCK");
    expect(createPaymentKey("  ", "MOCK", "cart-1")).toBe("order-cart-1-MOCK");
  });
});
