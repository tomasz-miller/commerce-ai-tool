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

  it("joins multiple searchTerms into one phrase instead of OR", () => {
    const body = buildProductSearchRequest({
      interpreted: {
        ...baseInterpreted,
        searchTerms: ["red", "dress"],
      },
      catalogLocale: "en",
    });

    const orClause = (body.query as {
      or?: Array<{ fullText?: { value?: string }; fuzzy?: { value?: string } }>;
    }).or;
    const values = orClause?.map((clause) => clause.fullText?.value ?? clause.fuzzy?.value);
    expect(values?.every((value) => value === "red dress")).toBe(true);
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

  it("maps price filters to centAmount range with currency", () => {
    const body = buildProductSearchRequest({
      interpreted: {
        searchTerms: ["shoes"],
        interpretation: "shoes under 200",
        filters: { priceMax: "200" },
      },
      catalogLocale: "en",
      options: { currency: "EUR" },
    });

    expect(body.query).toMatchObject({
      and: expect.arrayContaining([
        expect.objectContaining({
          and: expect.arrayContaining([
            expect.objectContaining({
              range: {
                field: "variants.prices.centAmount",
                ranges: [{ to: 20000 }],
              },
            }),
            expect.objectContaining({
              exact: {
                field: "variants.prices.currencyCode",
                value: "EUR",
              },
            }),
          ]),
        }),
      ]),
    });
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

  it("combines number Min/Max filters into a single range", () => {
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
            ranges: [{ from: 10, to: 20 }],
          },
        }),
      ]),
    });
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
