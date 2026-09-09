/** JSON Schema payloads for OpenRouter `json_schema` structured output. */

const nullableString = { type: ["string", "null"] } as const;

const filterItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "value"],
  properties: {
    name: { type: "string" },
    value: { type: "string" },
  },
} as const;

const suggestedFacetSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "reason"],
  properties: {
    name: { type: "string" },
    reason: nullableString,
  },
} as const;

const interpretedSearchProperties = {
  primaryTerm: nullableString,
  searchTerms: { type: "array", items: { type: "string" } },
  filters: {
    type: ["array", "null"],
    items: filterItemSchema,
  },
  suggestedFacets: {
    type: ["array", "null"],
    items: suggestedFacetSchema,
  },
  sort: { type: "string", enum: ["relevance", "price_asc", "price_desc"] },
  interpretation: { type: "string" },
} as const;

export const INTERPRETED_SEARCH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["primaryTerm", "searchTerms", "filters", "suggestedFacets", "sort", "interpretation"],
  properties: interpretedSearchProperties,
} as const;

export const VOICE_AUDIO_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "transcript",
    "enhancedQuery",
    "primaryTerm",
    "searchTerms",
    "filters",
    "suggestedFacets",
    "sort",
    "interpretation",
  ],
  properties: {
    transcript: { type: "string" },
    enhancedQuery: { type: "string" },
    ...interpretedSearchProperties,
  },
} as const;

export const SUGGEST_SEARCH_TERMS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: { type: "array", items: { type: "string" } },
  },
} as const;

const missionIntentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "quantity", "primaryTerm", "searchTerms", "filters", "sort"],
  properties: {
    label: { type: "string" },
    quantity: { type: "number" },
    primaryTerm: nullableString,
    searchTerms: { type: "array", items: { type: "string" } },
    filters: {
      type: ["array", "null"],
      items: filterItemSchema,
    },
    sort: { type: "string", enum: ["relevance", "price_asc", "price_desc"] },
  },
} as const;

export const MISSION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isMission", "confidence", "intents", "interpretation"],
  properties: {
    isMission: { type: "boolean" },
    confidence: { type: "number" },
    intents: { type: "array", items: missionIntentSchema },
    interpretation: { type: "string" },
  },
} as const;

export interface JsonSchemaResponseFormat {
  type: "json_schema";
  jsonSchema: {
    name: string;
    strict: boolean;
    schema: Record<string, unknown>;
  };
}

export interface JsonObjectResponseFormat {
  type: "json_object";
}

export function jsonSchemaResponseFormat(
  name: string,
  schema: object,
): JsonSchemaResponseFormat {
  return {
    type: "json_schema",
    jsonSchema: {
      name,
      strict: true,
      schema: schema as Record<string, unknown>,
    },
  };
}

/** Prompt fallback when the provider cannot send OpenRouter `json_schema`. */
export function structuredOutputInstruction(schema: object): string {
  return `Respond with valid JSON only, matching this schema (use null for optional empty fields):\n${JSON.stringify(schema)}`;
}
