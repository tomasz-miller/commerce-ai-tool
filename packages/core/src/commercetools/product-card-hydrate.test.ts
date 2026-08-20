import { describe, expect, it, vi } from "vitest";
import { PRODUCT_CARDS_GRAPHQL_QUERY } from "./graphql-product-cards.js";
import { hydrateProductCards, type ProductCardHydrateTransport } from "./product-card-hydrate.js";

function createTransport(
  overrides: Partial<ProductCardHydrateTransport> = {},
): ProductCardHydrateTransport {
  return {
    graphql: vi.fn().mockResolvedValue({
      data: {
        products: {
          results: [
            {
              id: "p1",
              masterData: {
                current: {
                  name: "Shoe",
                  masterVariant: {
                    id: 1,
                    sku: "SKU-1",
                    price: {
                      value: { centAmount: 1000, currencyCode: "EUR", fractionDigits: 2 },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    }),
    rest: vi.fn().mockResolvedValue([
      {
        id: "p1",
        name: "REST Shoe",
        sku: "SKU-1",
      },
    ]),
    ...overrides,
  };
}

describe("hydrateProductCards", () => {
  it("returns GraphQL cards and does not call REST on success", async () => {
    const transport = createTransport();
    const cards = await hydrateProductCards(transport, ["p1"], "en", "EUR", "DE");

    expect(cards).toHaveLength(1);
    expect(cards[0]?.name).toBe("Shoe");
    expect(transport.graphql).toHaveBeenCalledWith({
      query: PRODUCT_CARDS_GRAPHQL_QUERY,
      variables: expect.objectContaining({
        currency: "EUR",
        country: "DE",
        locale: "en",
      }),
    });
    expect(transport.rest).not.toHaveBeenCalled();
  });

  it("keeps GraphQL data when field errors are present", async () => {
    const transport = createTransport({
      graphql: vi.fn().mockResolvedValue({
        data: {
          products: {
            results: [
              {
                id: "p1",
                masterData: { current: { name: "Partial", masterVariant: { id: 1 } } },
              },
            ],
          },
        },
        errors: [{ message: "price unavailable" }],
      }),
    });

    const cards = await hydrateProductCards(transport, ["p1"], "en", "EUR");
    expect(cards[0]?.name).toBe("Partial");
    expect(transport.rest).not.toHaveBeenCalled();
  });

  it("falls back to REST when GraphQL has fatal errors without results", async () => {
    const transport = createTransport({
      graphql: vi.fn().mockResolvedValue({
        data: { products: null },
        errors: [{ message: "Syntax Error" }],
      }),
    });

    const cards = await hydrateProductCards(transport, ["p1"], "no", "EUR", "DE");

    expect(cards).toEqual([{ id: "p1", name: "REST Shoe", sku: "SKU-1" }]);
    expect(transport.rest).toHaveBeenCalledWith({
      productIds: ["p1"],
      locale: "no",
      currency: "EUR",
      country: "DE",
    });
  });

  it("falls back to REST when GraphQL transport throws", async () => {
    const transport = createTransport({
      graphql: vi.fn().mockRejectedValue(new Error("network down")),
    });

    const cards = await hydrateProductCards(transport, ["p1"], "en", "EUR", "DE");

    expect(cards[0]?.name).toBe("REST Shoe");
    expect(transport.rest).toHaveBeenCalledWith({
      productIds: ["p1"],
      locale: "en",
      currency: "EUR",
      country: "DE",
    });
  });
});
