import type {
  FacetAttributeDefinition,
  FacetAttributeType,
  ResolvedFacetSchema,
} from "../types/index.js";

interface ProductTypeAttribute {
  name: string;
  label?: Record<string, string>;
  isSearchable?: boolean;
  type: {
    name: string;
    elementType?: { name: string };
  };
}

export interface ProductTypeForFacets {
  version: number;
  attributes?: ProductTypeAttribute[];
}

export interface FacetSchemaOptions {
  projectKey: string;
  catalogLocale: string;
  include?: string[];
  exclude?: string[];
  maxAttributes?: number;
}

interface CachedSchema {
  expiresAt: number;
  schema: ResolvedFacetSchema;
}

export class FacetSchemaStore {
  private readonly entries = new Map<string, CachedSchema>();
  private readonly pending = new Map<string, Promise<ResolvedFacetSchema>>();

  constructor(private readonly ttlMs = 10 * 60_000) {}

  async getOrResolve(
    options: FacetSchemaOptions,
    loadProductTypes: () => Promise<ProductTypeForFacets[]>,
  ): Promise<ResolvedFacetSchema> {
    const key = buildSchemaCacheKey(options);
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.schema;
    }

    const inFlight = this.pending.get(key);
    if (inFlight) {
      return inFlight;
    }

    const request = loadProductTypes()
      .then((productTypes) => resolveFacetSchema(productTypes, options))
      .then((schema) => {
        this.entries.set(key, { schema, expiresAt: Date.now() + this.ttlMs });
        return schema;
      })
      .finally(() => this.pending.delete(key));

    this.pending.set(key, request);
    return request;
  }

  clear(): void {
    this.entries.clear();
  }
}

export function resolveFacetSchema(
  productTypes: ProductTypeForFacets[],
  options: FacetSchemaOptions,
): ResolvedFacetSchema {
  const candidates = new Map<string, FacetAttributeDefinition>();
  const conflicts = new Set<string>();

  for (const productType of productTypes) {
    for (const attribute of productType.attributes ?? []) {
      if (!attribute.isSearchable) {
        continue;
      }

      const definition = toFacetAttribute(attribute, options.catalogLocale);
      if (!definition) {
        continue;
      }

      const existing = candidates.get(definition.name);
      if (!existing) {
        candidates.set(definition.name, definition);
      } else if (
        existing.attributeType !== definition.attributeType ||
        existing.field !== definition.field
      ) {
        conflicts.add(definition.name);
      }
    }
  }

  const included = options.include?.length ? new Set(options.include) : undefined;
  const excluded = new Set(options.exclude ?? []);
  const attributes = [...candidates.values()]
    .filter((attribute) => !conflicts.has(attribute.name))
    .filter((attribute) => !included || included.has(attribute.name))
    .filter((attribute) => !excluded.has(attribute.name))
    .sort((left, right) => left.label.localeCompare(right.label))
    .slice(0, options.maxAttributes ?? 12);

  return {
    attributes,
    systemFacets: ["categories", "price"],
    etag: buildSchemaEtag(attributes, productTypes),
    resolvedAt: new Date().toISOString(),
  };
}

function toFacetAttribute(
  attribute: ProductTypeAttribute,
  catalogLocale: string,
): FacetAttributeDefinition | undefined {
  const attributeType = normalizeAttributeType(attribute.type);
  if (!attributeType) {
    return undefined;
  }

  const label =
    attribute.label?.[catalogLocale] ??
    attribute.label?.[catalogLocale.split("-")[0] ?? catalogLocale] ??
    Object.values(attribute.label ?? {})[0] ??
    attribute.name;
  const isEnum = attributeType === "enum" || attributeType === "lenum";

  return {
    name: attribute.name,
    label,
    kind: attributeType === "number" ? "range" : "distinct",
    attributeType,
    field: isEnum
      ? `variants.attributes.${attribute.name}.key`
      : `variants.attributes.${attribute.name}`,
    fieldType: isEnum ? "enum" : attributeType,
  };
}

function normalizeAttributeType(
  type: ProductTypeAttribute["type"],
): FacetAttributeType | undefined {
  const name = type.name === "set" ? type.elementType?.name : type.name;
  if (name === "enum" || name === "lenum" || name === "boolean" || name === "text" || name === "number") {
    return name;
  }
  return undefined;
}

function buildSchemaCacheKey(options: FacetSchemaOptions): string {
  return [
    options.projectKey,
    options.catalogLocale,
    [...(options.include ?? [])].sort().join(","),
    [...(options.exclude ?? [])].sort().join(","),
    String(options.maxAttributes ?? 12),
  ].join("|");
}

function buildSchemaEtag(
  attributes: FacetAttributeDefinition[],
  productTypes: ProductTypeForFacets[],
): string {
  const content = JSON.stringify({
    attributes,
    productTypeVersions: productTypes.map((productType) => productType.version).sort(),
  });
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (hash * 31 + content.charCodeAt(index)) | 0;
  }
  return `facet-${(hash >>> 0).toString(36)}`;
}
