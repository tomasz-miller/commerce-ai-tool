import type { FacetAttributeDefinition } from "@commerce-ai-tool/core";

export const SAMPLE_ATTRIBUTE_CATALOG: FacetAttributeDefinition[] = [
  {
    name: "color",
    label: "Color",
    kind: "distinct",
    attributeType: "enum",
    field: "variants.attributes.color.key",
    fieldType: "enum",
  },
  {
    name: "brand",
    label: "Brand",
    kind: "distinct",
    attributeType: "text",
    field: "variants.attributes.brand",
    fieldType: "text",
  },
  {
    name: "height",
    label: "Height",
    kind: "range",
    attributeType: "number",
    field: "variants.attributes.height",
    fieldType: "number",
  },
];
