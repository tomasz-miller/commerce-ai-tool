import { describe, expect, it } from "vitest";
import {
  buildProductSearchRequest,
  buildProjectionSearchQueryArgs,
  hasSearchableContent,
  joinSearchTerms,
} from "./query-builder.js";

const baseInterpreted = {
  searchTerms: ["red dress"],
  interpretation: "red dress",
  sort: "relevance" as const,
};

/** Collects every `range` expression in a query tree. */
function collectRanges(node: unknown): unknown[] {
  if (Array.isArray(node)) {
    return node.flatMap(collectRanges);
  }
  if (!node || typeof node !== "object") {
    return [];
  }
  const record = node as Record<string, unknown>;
  const own = record.range ? [record.range] : [];
  return [...own, ...Object.values(record).flatMap(collectRanges)];
}

describe("joinSearchTerms", () => {
  it("joins multiple terms into one phrase", () => {
    expect(joinSearchTerms(["red", "dress"])).toBe("red dress");
  });
});

describe("hasSearchableContent", () => {
  it("returns true when search terms are present", () => {
    expect(hasSearchableContent(baseInterpreted)).toBe(true);
  });

  it("returns true when only filters are present", () => {
    expect(
      hasSearchableContent({
        searchTerms: [],
        filters: { color: "red" },
        interpretation: "red products",
      }),
    ).toBe(true);
  });

  it("returns false when neither terms nor filters are present", () => {
    expect(
      hasSearchableContent({
        searchTerms: [],
        interpretation: "hello",
      }),
    ).toBe(false);
  });
});

describe("buildProductSearchRequest", () => {
  it("builds multi-field fullText with mustMatch all and fuzzy on name", () => {
    const body = buildProductSearchRequest({
      interpreted: baseInterpreted,
      catalogLocale: "en",
      limit: 10,
    });

    expect(body.limit).toBe(10);
    expect(body.query).toMatchObject({
      or: expect.arrayContaining([
        expect.objectContaining({
          fullText: expect.objectContaining({
            field: "name",
            language: "en",
            value: "red dress",
            mustMatch: "all",
            boost: 3,
          }),
        }),
        expect.objectContaining({
          fullText: expect.objectContaining({
            field: "searchKeywords",
            boost: 2,
          }),
        }),
        expect.objectContaining({
          fuzzy: expect.objectContaining({
            field: "name",
            value: "red dress",
            level: 1,
          }),
        }),
      ]),
    });
  });

  it("ORs alternative search phrases instead of joining them", () => {
    const body = buildProductSearchRequest({
      interpreted: {
        ...baseInterpreted,
        searchTerms: ["glasses", "mugs"],
      },
      catalogLocale: "en",
    });

    const outer = body.query as {
      or?: Array<{
        or?: Array<{ fullText?: { value?: string }; fuzzy?: { value?: string } }>;
      }>;
    };
    expect(outer.or).toHaveLength(2);
    const phraseValues = outer.or?.map((phraseQuery) => {
      const values = phraseQuery.or?.map((clause) => clause.fullText?.value ?? clause.fuzzy?.value);
      expect(values?.every((value) => value === values[0])).toBe(true);
      return values?.[0];
    });
    expect(phraseValues).toEqual(["glasses", "mugs"]);
  });

  it("combines text query and filters with and", () => {
    const body = buildProductSearchRequest({
      interpreted: {
        ...baseInterpreted,
        filters: { color: "red", brand: "Nike" },
      },
      catalogLocale: "en",
      options: { currency: "EUR" },
    });

    expect(body.query).toMatchObject({
      and: expect.arrayContaining([
        expect.objectContaining({ or: expect.any(Array) }),
        expect.objectContaining({
          and: expect.arrayContaining([
            expect.objectContaining({
              exact: expect.objectContaining({
                field: "variants.attributes.color.key",
                value: "red",
              }),
            }),
            expect.objectContaining({
              exact: expect.objectContaining({
                field: "variants.attributes.brand",
                value: "Nike",
              }),
            }),
          ]),
        }),
      ]),
    });
  });

  it("adds currency-scoped price sort", () => {
    const body = buildProductSearchRequest({
      interpreted: {
        ...baseInterpreted,
        sort: "price_asc",
      },
      catalogLocale: "en",
      options: { currency: "EUR" },
    });

    expect(body.sort).toEqual([
      {
        field: "variants.prices.centAmount",
        order: "asc",
        filter: {
          exact: {
            field: "variants.prices.currencyCode",
            value: "EUR",
          },
        },
      },
    ]);
  });

  it("price range uses gte/lte", () => {
    const body = buildProductSearchRequest({
      interpreted: {
        searchTerms: ["shoes"],
        interpretation: "shoes between 50 and 200",
        filters: { priceMin: "50", priceMax: "200" },
      },
      catalogLocale: "en",
      options: { currency: "EUR" },
    });

    expect(body.query).toMatchObject({
      and: expect.arrayContaining([
        expect.objectContaining({
          and: expect.arrayContaining([
            {
              range: {
                field: "variants.prices.currentCentAmount",
                gte: 5000,
                lte: 20000,
              },
            },
            {
              exact: {
                field: "variants.prices.currencyCode",
                value: "EUR",
              },
            },
          ]),
        }),
      ]),
    });
    expect(JSON.stringify(body.query)).not.toContain('"ranges"');
  });

  it("emits an open-ended price range with a single bound", () => {
    const body = buildProductSearchRequest({
      interpreted: { ...baseInterpreted, filters: { priceMax: "200" } },
      catalogLocale: "en",
      options: { currency: "EUR" },
    });

    const ranges = collectRanges(body.query);
    expect(ranges).toEqual([
      { field: "variants.prices.currentCentAmount", lte: 20000 },
    ]);
  });

  it("JPY price 5000 is 5000 cent amount", () => {
    const body = buildProductSearchRequest({
      interpreted: { ...baseInterpreted, filters: { priceMin: "1000", priceMax: "5000" } },
      catalogLocale: "ja",
      options: { currency: "JPY" },
    });

    expect(collectRanges(body.query)).toEqual([
      { field: "variants.prices.currentCentAmount", gte: 1000, lte: 5000 },
    ]);
  });

  it("uses three fraction digits for KWD and falls back to two for an unknown currency", () => {
    const kwd = buildProductSearchRequest({
      interpreted: { ...baseInterpreted, filters: { priceMax: "5" } },
      catalogLocale: "en",
      options: { currency: "KWD" },
    });
    expect(collectRanges(kwd.query)).toEqual([
      { field: "variants.prices.currentCentAmount", lte: 5000 },
    ]);

    for (const options of [{ currency: "not-a-currency" }, {}]) {
      const body = buildProductSearchRequest({
        interpreted: { ...baseInterpreted, filters: { priceMax: "5" } },
        catalogLocale: "en",
        options,
      });
      expect(collectRanges(body.query)).toEqual([
        { field: "variants.prices.currentCentAmount", lte: 500 },
      ]);
    }
  });

  it("uses schema attribute fields for color when a facet schema is present", () => {
    const body = buildProductSearchRequest({
      interpreted: {
        ...baseInterpreted,
        filters: { color: "red" },
        suggestedFacets: [{ name: "color" }],
      },
      catalogLocale: "en",
      facetSchema: {
        attributes: [
          {
            name: "color",
            label: "Color",
            kind: "distinct",
            attributeType: "text",
            field: "variants.attributes.color",
            fieldType: "text",
          },
        ],
        systemFacets: ["categories", "price"],
        etag: "e1",
        resolvedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(JSON.stringify(body.query)).toContain("variants.attributes.color");
    expect(JSON.stringify(body.query)).not.toContain("variants.attributes.color.key");
  });

  it("skips color filters excluded from the facet schema", () => {
    const body = buildProductSearchRequest({
      interpreted: {
        ...baseInterpreted,
        filters: { color: "red" },
      },
      catalogLocale: "en",
      facetSchema: {
        attributes: [
          {
            name: "size",
            label: "Size",
            kind: "distinct",
            attributeType: "enum",
            field: "variants.attributes.size.key",
            fieldType: "enum",
          },
        ],
        systemFacets: ["categories", "price"],
        etag: "e2",
        resolvedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(JSON.stringify(body.query)).not.toContain("color");
  });

  it("attribute range adds fieldType number and combines Min/Max into one gte/lte range", () => {
    const body = buildProductSearchRequest({
      interpreted: {
        ...baseInterpreted,
        filters: { heightMin: "10", heightMax: "20" },
      },
      catalogLocale: "en",
      facetSchema: {
        attributes: [
          {
            name: "height",
            label: "Height",
            kind: "range",
            attributeType: "number",
            field: "variants.attributes.height",
            fieldType: "number",
          },
        ],
        systemFacets: ["categories", "price"],
        etag: "e3",
        resolvedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(body.query).toMatchObject({
      and: expect.arrayContaining([
        expect.objectContaining({
          range: {
            field: "variants.attributes.height",
            fieldType: "number",
            gte: 10,
            lte: 20,
          },
        }),
      ]),
    });
  });

  it("range on a set of number uses the attribute's set_number fieldType", () => {
    const body = buildProductSearchRequest({
      interpreted: { ...baseInterpreted, filters: { widthMin: "5" } },
      catalogLocale: "en",
      facetSchema: {
        attributes: [
          {
            name: "width",
            label: "Width",
            kind: "range",
            attributeType: "number",
            field: "variants.attributes.width",
            fieldType: "set_number",
          },
        ],
        systemFacets: ["categories", "price"],
        etag: "e4",
        resolvedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(collectRanges(body.query)).toEqual([
      { field: "variants.attributes.width", fieldType: "set_number", gte: 5 },
    ]);
  });

  it("sends the schema fieldType for a lenum filter", () => {
    const body = buildProductSearchRequest({
      interpreted: { ...baseInterpreted, filters: { color: "red" } },
      catalogLocale: "en",
      facetSchema: {
        attributes: [
          {
            name: "color",
            label: "Color",
            kind: "distinct",
            attributeType: "lenum",
            field: "variants.attributes.color.key",
            fieldType: "lenum",
          },
        ],
        systemFacets: ["categories", "price"],
        etag: "e5",
        resolvedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(JSON.stringify(body.query)).toContain(
      '"field":"variants.attributes.color.key","fieldType":"lenum"',
    );
  });

  it("does not apply store scope unless enabled", () => {
    const body = buildProductSearchRequest({
      interpreted: baseInterpreted,
      catalogLocale: "en",
      options: { storeKey: "main-store", storeScopeEnabled: false },
    });

    expect(JSON.stringify(body.query)).not.toContain("stores");
  });

  it("applies store scope when enabled", () => {
    const body = buildProductSearchRequest({
      interpreted: baseInterpreted,
      catalogLocale: "en",
      options: { storeKey: "main-store", storeScopeEnabled: true },
    });

    expect(body.query).toMatchObject({
      and: expect.arrayContaining([
        expect.objectContaining({
          exact: expect.objectContaining({
            field: "stores",
            value: "main-store",
          }),
        }),
      ]),
    });
  });

  it("can disable fuzzy name matching", () => {
    const body = buildProductSearchRequest({
      interpreted: baseInterpreted,
      catalogLocale: "en",
      options: { enableFuzzyName: false },
    });

    expect(JSON.stringify(body.query)).not.toContain("fuzzy");
  });

  it("doubles field boosts for primaryTerm and skips fuzzy on alternates", () => {
    const body = buildProductSearchRequest({
      interpreted: {
        primaryTerm: "wine glass",
        searchTerms: ["wine glass", "glass"],
        interpretation: "drinkware",
      },
      catalogLocale: "en",
    });

    const outer = body.query as {
      or?: Array<{
        or?: Array<{ fullText?: { value?: string; boost?: number }; fuzzy?: { value?: string } }>;
      }>;
    };

    const primary = outer.or?.find((phrase) =>
      phrase.or?.some((clause) => clause.fullText?.value === "wine glass"),
    );
    const alternate = outer.or?.find((phrase) =>
      phrase.or?.some((clause) => clause.fullText?.value === "glass"),
    );

    expect(primary?.or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fullText: expect.objectContaining({ field: "name", boost: 6 }) }),
        expect.objectContaining({ fuzzy: expect.objectContaining({ value: "wine glass" }) }),
      ]),
    );
    expect(alternate?.or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fullText: expect.objectContaining({ field: "name", boost: 3 }) }),
      ]),
    );
    expect(JSON.stringify(alternate)).not.toContain("fuzzy");
  });

  it("uses mustMatch any when requested", () => {
    const body = buildProductSearchRequest({
      interpreted: baseInterpreted,
      catalogLocale: "en",
      options: { mustMatch: "any" },
    });

    expect(JSON.stringify(body.query)).toContain('"mustMatch":"any"');
  });
});

describe("buildProjectionSearchQueryArgs", () => {
  it("maps text search and filters to projection search args", () => {
    expect(
      buildProjectionSearchQueryArgs({
        interpreted: {
          searchTerms: ["jacket"],
          interpretation: "jacket",
          sort: "price_asc",
          filters: { color: "blue" },
        },
        catalogLocale: "en",
        limit: 10,
        offset: 5,
        options: { currency: "EUR" },
      }),
    ).toEqual({
      limit: 10,
      offset: 5,
      localeProjection: "en",
      fuzzy: true,
      "text.en": "jacket",
      priceCurrency: "EUR",
      filter: ['variants.attributes.color.key:"blue"'],
      sort: "price asc",
    });
  });

  it("uses only the first search phrase for projection search", () => {
    const args = buildProjectionSearchQueryArgs({
      interpreted: {
        searchTerms: ["glasses", "mugs", "cups"],
        interpretation: "something to drink from",
      },
      catalogLocale: "en-GB",
    });

    expect(args["text.en-GB"]).toBe("glasses");
  });

  it("includes store filter when store scope is enabled", () => {
    const args = buildProjectionSearchQueryArgs({
      interpreted: baseInterpreted,
      catalogLocale: "en",
      options: { storeKey: "main-store", storeScopeEnabled: true },
    });

    expect(args.filter).toContain('stores.key:"main-store"');
  });

  it("requests facet aggregations when a facet schema is present", () => {
    const args = buildProjectionSearchQueryArgs({
      interpreted: {
        ...baseInterpreted,
        suggestedFacets: [{ name: "color" }, { name: "price" }],
      },
      catalogLocale: "en",
      facetSchema: {
        attributes: [
          {
            name: "color",
            label: "Color",
            kind: "distinct",
            attributeType: "enum",
            field: "variants.attributes.color.key",
            fieldType: "enum",
          },
        ],
        systemFacets: ["categories", "price"],
        etag: "e4",
        resolvedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(args.facet).toEqual([
      "variants.attributes.color.key as color",
      "variants.prices.centAmount:range (* to 5000), (5000 to 10000), (10000 to *) as price",
    ]);
  });
});

describe("facet navigation (postFilter)", () => {
  const facetSchema = {
    attributes: [
      {
        name: "color",
        label: "Color",
        kind: "distinct" as const,
        attributeType: "enum" as const,
        field: "variants.attributes.color.key",
        fieldType: "enum" as const,
      },
      {
        name: "brand",
        label: "Brand",
        kind: "distinct" as const,
        attributeType: "text" as const,
        field: "variants.attributes.brand",
        fieldType: "text" as const,
      },
    ],
    systemFacets: ["categories", "price"] as Array<"categories" | "price">,
    etag: "pf",
    resolvedAt: "2026-01-01T00:00:00.000Z",
  };

  it("asks Product Search to mark matching variants", () => {
    const body = buildProductSearchRequest({ interpreted: baseInterpreted, catalogLocale: "en" });
    expect(body.markMatchingVariants).toBe(true);
  });

  it("a category chip goes to postFilter", () => {
    const body = buildProductSearchRequest({
      interpreted: {
        ...baseInterpreted,
        filters: { color: "red", category: "cat-1" },
        suggestedFacets: [{ name: "color" }, { name: "categories" }],
      },
      catalogLocale: "en",
      facetSchema,
      postFilterKeys: ["category"],
    });

    expect(JSON.stringify(body.query)).toContain("variants.attributes.color.key");
    expect(JSON.stringify(body.query)).not.toContain('"categories"');
    expect(body.postFilter).toEqual({
      exact: { field: "categories", value: "cat-1", caseInsensitive: true },
    });

    // Other groups count within the category selection; the categories group does not.
    const facets = body.facets as unknown as Array<Record<string, { name: string; filter?: unknown }>>;
    const byName = new Map(
      facets.map((facet) => {
        const value = Object.values(facet)[0]!;
        return [value.name, value] as const;
      }),
    );
    expect(JSON.stringify(byName.get("color")?.filter)).toContain('"categories"');
    expect(byName.get("categories")?.filter).toBeUndefined();
  });

  it("a chip request whose echoed filters include a variant-level key keeps that key in query", () => {
    // The widget echoes meta.appliedFilters (model constraints included) as `filters`, so a
    // variant-level key in postFilterKeys may be the model's own constraint. Keeping it in
    // `query` keeps it in matchingVariants (R28, until a protocol field carries chip keys).
    const body = buildProductSearchRequest({
      interpreted: {
        ...baseInterpreted,
        filters: { color: "red", brand: "Acme", priceMax: "50", category: "cat-1" },
        suggestedFacets: [{ name: "color" }, { name: "brand" }, { name: "price" }],
      },
      catalogLocale: "en",
      facetSchema,
      options: { currency: "EUR" },
      postFilterKeys: ["color", "brand", "priceMax", "category"],
    });

    const query = JSON.stringify(body.query);
    expect(query).toContain("variants.attributes.color.key");
    expect(query).toContain("variants.attributes.brand");
    expect(collectRanges(body.query)).toEqual([
      { field: "variants.prices.currentCentAmount", lte: 5_000 },
    ]);
    expect(JSON.stringify(body.postFilter)).not.toContain("variants.");
    expect(body.postFilter).toEqual({
      exact: { field: "categories", value: "cat-1", caseInsensitive: true },
    });
  });

  it("without postFilterAllGroups only categories go to postFilter", () => {
    const body = buildProductSearchRequest({
      interpreted: {
        ...baseInterpreted,
        filters: { color: "red", brand: "Acme", category: "cat-1" },
        suggestedFacets: [{ name: "color" }, { name: "brand" }],
      },
      catalogLocale: "en",
      facetSchema,
      postFilterKeys: ["color", "brand", "category"],
    });

    expect(body.postFilter).toEqual({
      exact: { field: "categories", value: "cat-1", caseInsensitive: true },
    });
  });

  it("postFilterAllGroups routes every chip group in postFilterKeys to postFilter", () => {
    const body = buildProductSearchRequest({
      interpreted: {
        ...baseInterpreted,
        filters: { color: "red", brand: "Acme", priceMax: "50", category: "cat-1" },
        suggestedFacets: [{ name: "color" }, { name: "brand" }, { name: "price" }],
      },
      catalogLocale: "en",
      facetSchema,
      options: { currency: "EUR" },
      postFilterKeys: ["color", "priceMax", "category"],
      postFilterAllGroups: true,
    });

    // color, price and categories are chips; brand is a model constraint and stays in query.
    const query = JSON.stringify(body.query);
    expect(query).toContain("variants.attributes.brand");
    expect(query).not.toContain("variants.attributes.color");
    expect(collectRanges(body.query)).toEqual([]);
    const postFilter = JSON.stringify(body.postFilter);
    expect(postFilter).toContain("variants.attributes.color.key");
    expect(postFilter).toContain("variants.prices.currentCentAmount");
    expect(postFilter).toContain('"categories"');
    expect(postFilter).not.toContain("variants.attributes.brand");

    // Each facet is filtered by the chips of the other groups, never its own.
    const facets = body.facets as unknown as Array<Record<string, { name: string; filter?: unknown }>>;
    const byName = new Map(
      facets.map((facet) => {
        const value = Object.values(facet)[0]!;
        return [value.name, value] as const;
      }),
    );
    expect(byName.get("color")?.filter).toBeDefined();
    expect(JSON.stringify(byName.get("color")?.filter)).not.toContain("variants.attributes.color");
  });

  it("keeps every filter in query when no facets are requested", () => {
    const body = buildProductSearchRequest({
      interpreted: { ...baseInterpreted, filters: { brand: "Acme" } },
      catalogLocale: "en",
      postFilterKeys: ["brand"],
    });
    expect(body.postFilter).toBeUndefined();
    expect(JSON.stringify(body.query)).toContain("variants.attributes.brand");
  });

  it("price facet is scoped to the cart currency", () => {
    const body = buildProductSearchRequest({
      interpreted: { ...baseInterpreted, suggestedFacets: [{ name: "price" }] },
      catalogLocale: "en",
      facetSchema,
      options: { currency: "JPY" },
    });
    const [facet] = body.facets as unknown as Array<{ ranges: { filter?: unknown } }>;
    expect(facet?.ranges.filter).toEqual({
      exact: { field: "variants.prices.currencyCode", value: "JPY" },
    });
  });
});
