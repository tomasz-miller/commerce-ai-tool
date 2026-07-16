import { describe, expect, it } from "vitest";
import { FacetSchemaStore, resolveFacetSchema } from "./product-types.js";

const options = {
  projectKey: "demo",
  catalogLocale: "en",
};

describe("resolveFacetSchema", () => {
  it("keeps searchable supported attributes and localized labels", () => {
    const schema = resolveFacetSchema(
      [
        {
          version: 1,
          attributes: [
            {
              name: "height",
              label: { en: "Height" },
              isSearchable: true,
              type: { name: "number" },
            },
            {
              name: "material",
              label: { en: "Material" },
              isSearchable: true,
              type: { name: "text" },
            },
            {
              name: "hidden",
              label: { en: "Hidden" },
              isSearchable: false,
              type: { name: "enum" },
            },
          ],
        },
      ],
      options,
    );

    expect(schema.attributes).toEqual([
      expect.objectContaining({ name: "height", kind: "range", label: "Height" }),
      expect.objectContaining({ name: "material", kind: "distinct", label: "Material" }),
    ]);
    expect(schema.systemFacets).toEqual(["categories", "price"]);
  });

  it("excludes conflicting attribute definitions", () => {
    const schema = resolveFacetSchema(
      [
        {
          version: 1,
          attributes: [{ name: "size", isSearchable: true, type: { name: "number" } }],
        },
        {
          version: 1,
          attributes: [{ name: "size", isSearchable: true, type: { name: "text" } }],
        },
      ],
      options,
    );

    expect(schema.attributes).toEqual([]);
  });
});

describe("FacetSchemaStore", () => {
  it("reuses a resolved schema until its TTL expires", async () => {
    const store = new FacetSchemaStore(60_000);
    let calls = 0;
    const load = async () => {
      calls += 1;
      return [{ version: 1, attributes: [] }];
    };

    await store.getOrResolve(options, load);
    await store.getOrResolve(options, load);

    expect(calls).toBe(1);
  });
});
