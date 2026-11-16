import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("lenum attribute maps to fieldType lenum", () => {
    const schema = resolveFacetSchema(
      [{ version: 1, attributes: [{ name: "color", isSearchable: true, type: { name: "lenum" } }] }],
      options,
    );

    expect(schema.attributes).toEqual([
      expect.objectContaining({
        attributeType: "lenum",
        field: "variants.attributes.color.key",
        fieldType: "lenum",
      }),
    ]);
  });

  it("enum attribute keeps fieldType enum and the .key path", () => {
    const schema = resolveFacetSchema(
      [{ version: 1, attributes: [{ name: "size", isSearchable: true, type: { name: "enum" } }] }],
      options,
    );

    expect(schema.attributes).toEqual([
      expect.objectContaining({ field: "variants.attributes.size.key", fieldType: "enum" }),
    ]);
  });

  it("set of enum maps to set_enum", () => {
    const schema = resolveFacetSchema(
      [
        {
          version: 1,
          attributes: [
            {
              name: "size",
              isSearchable: true,
              type: { name: "set", elementType: { name: "enum" } },
            },
          ],
        },
      ],
      options,
    );

    expect(schema.attributes).toEqual([
      expect.objectContaining({
        attributeType: "enum",
        field: "variants.attributes.size.key",
        fieldType: "set_enum",
      }),
    ]);
  });

  it("maps every supported set element type to set_*", () => {
    const elements = ["lenum", "text", "number", "boolean"] as const;
    const schema = resolveFacetSchema(
      [
        {
          version: 1,
          attributes: elements.map((element) => ({
            name: `a_${element}`,
            isSearchable: true,
            type: { name: "set", elementType: { name: element } },
          })),
        },
      ],
      { ...options, maxAttributes: 10 },
    );
    const byName = Object.fromEntries(
      schema.attributes.map((attribute) => [attribute.name, attribute]),
    );

    expect(byName.a_lenum).toMatchObject({
      field: "variants.attributes.a_lenum.key",
      fieldType: "set_lenum",
    });
    expect(byName.a_text).toMatchObject({
      field: "variants.attributes.a_text",
      fieldType: "set_text",
    });
    expect(byName.a_number).toMatchObject({
      kind: "range",
      field: "variants.attributes.a_number",
      fieldType: "set_number",
    });
    expect(byName.a_boolean).toMatchObject({
      field: "variants.attributes.a_boolean",
      fieldType: "set_boolean",
    });
  });

  it("scalar text, number and boolean keep their own fieldType", () => {
    const schema = resolveFacetSchema(
      [
        {
          version: 1,
          attributes: [
            { name: "a", isSearchable: true, type: { name: "text" } },
            { name: "b", isSearchable: true, type: { name: "number" } },
            { name: "c", isSearchable: true, type: { name: "boolean" } },
          ],
        },
      ],
      options,
    );

    expect(schema.attributes.map((attribute) => attribute.fieldType).sort()).toEqual([
      "boolean",
      "number",
      "text",
    ]);
  });

  it("treats a set and its scalar element as conflicting definitions", () => {
    const schema = resolveFacetSchema(
      [
        { version: 1, attributes: [{ name: "size", isSearchable: true, type: { name: "enum" } }] },
        {
          version: 1,
          attributes: [
            {
              name: "size",
              isSearchable: true,
              type: { name: "set", elementType: { name: "enum" } },
            },
          ],
        },
      ],
      options,
    );

    expect(schema.attributes).toEqual([]);
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
  afterEach(() => {
    vi.useRealTimers();
  });

  function loader() {
    const state = { calls: 0 };
    const load = async () => {
      state.calls += 1;
      return [
        {
          version: 1,
          attributes: [
            {
              name: "color",
              label: { en: "Color", de: "Farbe" },
              isSearchable: true,
              type: { name: "text" },
            },
          ],
        },
      ];
    };
    return { state, load };
  }

  it("reuses a resolved schema until its TTL expires", async () => {
    const store = new FacetSchemaStore(60_000);
    const { state, load } = loader();

    await store.getOrResolve(options, load);
    await store.getOrResolve(options, load);

    expect(state.calls).toBe(1);
  });

  it("a new locale does not call loadProductTypes again within TTL", async () => {
    const store = new FacetSchemaStore(60_000);
    const { state, load } = loader();

    const en = await store.getOrResolve(options, load);
    const de = await store.getOrResolve({ ...options, catalogLocale: "de" }, load);

    expect(state.calls).toBe(1);
    expect(en.attributes[0]?.label).toBe("Color");
    expect(de.attributes[0]?.label).toBe("Farbe");
  });

  it("shares one in-flight product type load across concurrent locales", async () => {
    const store = new FacetSchemaStore(60_000);
    const { state, load } = loader();

    await Promise.all(
      ["en", "de", "fr", "pl"].map((catalogLocale) =>
        store.getOrResolve({ ...options, catalogLocale }, load),
      ),
    );

    expect(state.calls).toBe(1);
  });

  it("loads product types per project", async () => {
    const store = new FacetSchemaStore(60_000);
    const { state, load } = loader();

    await store.getOrResolve(options, load);
    await store.getOrResolve({ ...options, projectKey: "other" }, load);

    expect(state.calls).toBe(2);
  });

  it("reloads product types after the TTL", async () => {
    vi.useFakeTimers();
    const store = new FacetSchemaStore(1_000);
    const { state, load } = loader();

    await store.getOrResolve(options, load);
    vi.advanceTimersByTime(1_001);
    await store.getOrResolve({ ...options, catalogLocale: "de" }, load);

    expect(state.calls).toBe(2);
  });

  it("FacetSchemaStore evicts beyond maxEntries", async () => {
    const store = new FacetSchemaStore(60_000, 2);
    const { load } = loader();
    const at = (catalogLocale: string) => store.getOrResolve({ ...options, catalogLocale }, load);

    const first = await at("en");
    await at("de");
    await at("fr");

    expect(await at("en")).not.toBe(first);
  });

  it("evicts the least recently used schema", async () => {
    const store = new FacetSchemaStore(60_000, 2);
    const { load } = loader();
    const at = (catalogLocale: string) => store.getOrResolve({ ...options, catalogLocale }, load);

    const en = await at("en");
    const de = await at("de");
    expect(await at("en")).toBe(en);
    await at("fr");

    expect(await at("en")).toBe(en);
    expect(await at("de")).not.toBe(de);
  });

  it("drops an expired schema on read", async () => {
    vi.useFakeTimers();
    const store = new FacetSchemaStore(1_000);
    const { load } = loader();

    const first = await store.getOrResolve(options, load);
    vi.advanceTimersByTime(1_001);

    expect(await store.getOrResolve(options, load)).not.toBe(first);
  });

  it("does not cache a failed product type load", async () => {
    const store = new FacetSchemaStore(60_000);
    const { state, load } = loader();

    await expect(
      store.getOrResolve(options, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await store.getOrResolve(options, load);

    expect(state.calls).toBe(1);
  });
});
