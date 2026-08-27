import { describe, expect, it } from "vitest";
import {
  GRAPHQL_PRODUCT_CARD_CHUNK_SIZE,
  PRODUCT_CARDS_GRAPHQL_QUERY,
  buildAcceptLanguageLocales,
  buildProductCardsGraphQLVariables,
  buildProductIdsWhere,
  chunkProductIds,
  decideGraphQLProductCardsHydrate,
  extractGraphQLProductResults,
  mapGraphQLProductToCard,
  mapGraphQLProductsToCards,
  pickLocalizedValue,
  type GraphQLProductCardResult,
} from "./graphql-product-cards.js";

describe("buildProductIdsWhere", () => {
  it("builds an id-in predicate with quoted UUIDs", () => {
    expect(buildProductIdsWhere(["aaa", "bbb"])).toBe('id in ("aaa","bbb")');
  });
});

describe("chunkProductIds", () => {
  it("returns empty for no ids", () => {
    expect(chunkProductIds([])).toEqual([]);
  });

  it("keeps a small list as a single chunk", () => {
    expect(chunkProductIds(["a", "b", "c"])).toEqual([["a", "b", "c"]]);
  });

  it("splits into chunks of GRAPHQL_PRODUCT_CARD_CHUNK_SIZE", () => {
    const ids = Array.from({ length: GRAPHQL_PRODUCT_CARD_CHUNK_SIZE + 3 }, (_, i) => `id-${i}`);
    const chunks = chunkProductIds(ids);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(GRAPHQL_PRODUCT_CARD_CHUNK_SIZE);
    expect(chunks[1]).toEqual(["id-100", "id-101", "id-102"]);
  });
});

describe("buildAcceptLanguageLocales", () => {
  it("expands en-GB with English siblings before bare en", () => {
    expect(buildAcceptLanguageLocales("en-GB")).toEqual(["en-GB", "en-US", "en"]);
  });

  it("keeps bare en first then adds regional English locales", () => {
    expect(buildAcceptLanguageLocales("en")).toEqual(["en", "en-GB", "en-US"]);
  });

  it("adds language tag and English fallbacks for non-English locales", () => {
    expect(buildAcceptLanguageLocales("de-DE")).toEqual([
      "de-DE",
      "de",
      "en-GB",
      "en-US",
      "en",
    ]);
  });
});

describe("buildProductCardsGraphQLVariables", () => {
  it("omits country when unset and expands en-GB acceptLanguage", () => {
    const variables = buildProductCardsGraphQLVariables(["p1"], "en-GB", "EUR");
    expect(variables).toEqual({
      where: 'id in ("p1")',
      limit: 1,
      locales: ["en-GB", "en-US", "en"],
      currency: "EUR",
    });
    expect("country" in variables).toBe(false);
  });

  it("includes country when provided", () => {
    const variables = buildProductCardsGraphQLVariables(["p1"], "en", "EUR", "DE");
    expect(variables.country).toBe("DE");
    expect(variables.locales).toEqual(["en", "en-GB", "en-US"]);
  });
});

describe("PRODUCT_CARDS_GRAPHQL_QUERY", () => {
  it("uses acceptLanguage only (not locale together with acceptLanguage)", () => {
    expect(PRODUCT_CARDS_GRAPHQL_QUERY).not.toContain("localeProjection");
    expect(PRODUCT_CARDS_GRAPHQL_QUERY).toContain("name(acceptLanguage: $locales)");
    expect(PRODUCT_CARDS_GRAPHQL_QUERY).not.toContain("locale: $locale");
    expect(PRODUCT_CARDS_GRAPHQL_QUERY).toContain("nameAllLocales");
  });
});

describe("pickLocalizedValue", () => {
  it("prefers the direct string when present", () => {
    expect(
      pickLocalizedValue("Direct", [{ locale: "en-GB", value: "AllLocales" }], ["en-GB"]),
    ).toBe("Direct");
  });

  it("picks from allLocales by preferred order when direct is null", () => {
    expect(
      pickLocalizedValue(
        null,
        [
          { locale: "de-DE", value: "Deutsch" },
          { locale: "en-GB", value: "Art Deco Coffee Table" },
          { locale: "en-US", value: "US Name" },
        ],
        ["en-GB", "en-US", "en"],
      ),
    ).toBe("Art Deco Coffee Table");
  });
});

describe("mapGraphQLProductToCard", () => {
  it("maps published product fields including selected price", () => {
    const product: GraphQLProductCardResult = {
      id: "prod-1",
      key: "red-shoe",
      masterData: {
        current: {
          name: "Red Shoe",
          description: "A nice shoe",
          slug: "red-shoe",
          masterVariant: {
            id: 1,
            sku: "SHOE-RED",
            images: [{ url: "https://cdn.example/shoe.jpg" }],
            price: {
              value: { centAmount: 1999, currencyCode: "EUR", fractionDigits: 2 },
            },
          },
        },
      },
    };

    expect(mapGraphQLProductToCard(product, "en")).toEqual({
      id: "prod-1",
      key: "red-shoe",
      name: "Red Shoe",
      description: "A nice shoe",
      imageUrl: "https://cdn.example/shoe.jpg",
      sku: "SHOE-RED",
      variantId: 1,
      slug: "red-shoe",
      price: {
        amount: 19.99,
        currency: "EUR",
        formatted: new Intl.NumberFormat("en", { style: "currency", currency: "EUR" }).format(
          19.99,
        ),
      },
    });
  });

  it("falls back to nameAllLocales when name(locale) is null", () => {
    const product: GraphQLProductCardResult = {
      id: "c74d402f-f728-46de-83f6-2a565b793134",
      key: "art-deco-coffee-table",
      masterData: {
        current: {
          name: null,
          description: null,
          slug: null,
          nameAllLocales: [
            { locale: "en-US", value: "Art Deco Coffee Table" },
            { locale: "en-GB", value: "Art Deco Coffee Table" },
            { locale: "de-DE", value: "Couchtisch im Art-Deco-Stil" },
          ],
          slugAllLocales: [{ locale: "en-GB", value: "art-deco-coffe-table" }],
          masterVariant: {
            id: 1,
            sku: "ADCT-01",
            images: [{ url: "https://cdn.example/table.jpg" }],
          },
        },
      },
    };

    const card = mapGraphQLProductToCard(product, "en-GB");
    expect(card?.name).toBe("Art Deco Coffee Table");
    expect(card?.slug).toBe("art-deco-coffe-table");
  });

  it("returns null when current projection is missing", () => {
    expect(
      mapGraphQLProductToCard(
        { id: "draft-1", masterData: { current: null } },
        "en",
      ),
    ).toBeNull();
  });
});

describe("mapGraphQLProductsToCards", () => {
  it("skips unpublished products and preserves Product Search order", () => {
    const results: GraphQLProductCardResult[] = [
      {
        id: "b",
        masterData: {
          current: {
            name: "Second",
            masterVariant: { id: 1, sku: "B" },
          },
        },
      },
      {
        id: "a",
        masterData: {
          current: {
            name: "First",
            masterVariant: { id: 1, sku: "A" },
          },
        },
      },
      {
        id: "c",
        masterData: { current: null },
      },
    ];

    const cards = mapGraphQLProductsToCards(results, ["a", "b", "c"], "en");
    expect(cards.map((card) => card.id)).toEqual(["a", "b"]);
    expect(cards.map((card) => card.name)).toEqual(["First", "Second"]);
  });
});

describe("extractGraphQLProductResults", () => {
  it("filters null results and missing ids", () => {
    expect(
      extractGraphQLProductResults({
        products: {
          results: [null, { id: "ok" }, { id: "" } as GraphQLProductCardResult],
        },
      }),
    ).toEqual([{ id: "ok" }]);
  });
});

describe("decideGraphQLProductCardsHydrate", () => {
  it("uses data when results are present even with field errors", () => {
    const decision = decideGraphQLProductCardsHydrate({
      data: {
        products: {
          results: [{ id: "p1", masterData: { current: { name: "Shoe" } } }],
        },
      },
      errors: [{ message: "Cannot return price for variant" }],
    });

    expect(decision).toEqual({
      type: "use-data",
      data: {
        products: {
          results: [{ id: "p1", masterData: { current: { name: "Shoe" } } }],
        },
      },
      warnings: ["Cannot return price for variant"],
    });
  });

  it("falls back when errors exist and results payload is missing", () => {
    expect(
      decideGraphQLProductCardsHydrate({
        data: { products: null },
        errors: [{ message: "Syntax error" }],
      }),
    ).toEqual({
      type: "fallback",
      reason: "Syntax error",
    });
  });

  it("treats empty results without errors as success", () => {
    expect(
      decideGraphQLProductCardsHydrate({
        data: { products: { results: [] } },
      }),
    ).toEqual({
      type: "use-data",
      data: { products: { results: [] } },
      warnings: [],
    });
  });
});
