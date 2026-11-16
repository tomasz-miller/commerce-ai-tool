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

interface CachedProductTypes {
  expiresAt: number;
  productTypes: ProductTypeForFacets[];
}

/**
 * Two bounded caches. Product types are loaded once per TTL per project, independent of
 * locale, options or request volume. Resolved schemas (one per options key) are derived
 * from that list, so a new locale costs no commercetools call. Resolved schemas live in a
 * small LRU (`maxEntries`) and never outlive the product type list they came from.
 */
export class FacetSchemaStore {
  private readonly schemas = new Map<string, CachedSchema>();
  private readonly productTypes = new Map<string, CachedProductTypes>();
  private readonly pendingSchemas = new Map<string, Promise<ResolvedFacetSchema>>();
  private readonly pendingProductTypes = new Map<string, Promise<CachedProductTypes>>();

  constructor(
    private readonly ttlMs = 600_000,
    private readonly maxEntries = 32,
  ) {}

  async getOrResolve(
    options: FacetSchemaOptions,
    loadProductTypes: () => Promise<ProductTypeForFacets[]>,
  ): Promise<ResolvedFacetSchema> {
    const key = buildSchemaCacheKey(options);
    const cached = this.readFresh(this.schemas, key);
    if (cached) {
      return cached.schema;
    }

    const inFlight = this.pendingSchemas.get(key);
    if (inFlight) {
      return inFlight;
    }

    const request = this.loadProductTypes(options.projectKey, loadProductTypes)
      .then(({ productTypes, expiresAt }) => {
        const schema = resolveFacetSchema(productTypes, options);
        this.store(this.schemas, key, { schema, expiresAt });
        return schema;
      })
      .finally(() => this.pendingSchemas.delete(key));

    this.pendingSchemas.set(key, request);
    return request;
  }

  clear(): void {
    this.schemas.clear();
    this.productTypes.clear();
  }

  private loadProductTypes(
    projectKey: string,
    load: () => Promise<ProductTypeForFacets[]>,
  ): Promise<CachedProductTypes> {
    const cached = this.readFresh(this.productTypes, projectKey);
    if (cached) {
      return Promise.resolve(cached);
    }

    const inFlight = this.pendingProductTypes.get(projectKey);
    if (inFlight) {
      return inFlight;
    }

    const request = load()
      .then((productTypes) => {
        const entry = { productTypes, expiresAt: Date.now() + this.ttlMs };
        this.store(this.productTypes, projectKey, entry);
        return entry;
      })
      .finally(() => this.pendingProductTypes.delete(projectKey));

    this.pendingProductTypes.set(projectKey, request);
    return request;
  }

  /** Returns a fresh entry and marks it most recently used; deletes an expired one. */
  private readFresh<T extends { expiresAt: number }>(
    map: Map<string, T>,
    key: string,
  ): T | undefined {
    const entry = map.get(key);
    if (!entry) {
      return undefined;
    }
    map.delete(key);
    if (entry.expiresAt <= Date.now()) {
      return undefined;
    }
    map.set(key, entry);
    return entry;
  }

  /** Inserts as most recently used and evicts the least recently used beyond the cap. */
  private store<T>(map: Map<string, T>, key: string, entry: T): void {
    map.delete(key);
    map.set(key, entry);
    while (map.size > this.maxEntries) {
      const oldest = map.keys().next();
      if (oldest.done) {
        break;
      }
      map.delete(oldest.value);
    }
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
        existing.field !== definition.field ||
        existing.fieldType !== definition.fieldType
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
  const isSet = attribute.type.name === "set";

  return {
    name: attribute.name,
    label,
    kind: attributeType === "number" ? "range" : "distinct",
    attributeType,
    // Per the Product Search attribute table: (set of) enum and lenum are addressed via `.key`.
    field: isEnum
      ? `variants.attributes.${attribute.name}.key`
      : `variants.attributes.${attribute.name}`,
    fieldType: isSet ? `set_${attributeType}` : attributeType,
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
