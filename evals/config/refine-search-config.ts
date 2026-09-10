import { SAMPLE_ATTRIBUTE_CATALOG } from "./sample-attribute-catalog.ts";

export default function refineSearchConfig() {
  return {
    description: "Commerce AI — refine-query interpretation evals",
    prompts: ["{{refineQuery}}"],
    providers: [
      {
        id: "file://providers/refine-search-provider.ts",
        label: "openrouter-gpt-56-luna",
        config: {
          provider: "openrouter",
          model: "openai/gpt-5.6-luna",
        },
      },
    ],
    defaultTest: {
      vars: {
        attributeCatalog: JSON.stringify(SAMPLE_ATTRIBUTE_CATALOG),
      },
      assert: [
        {
          type: "javascript",
          value: `Array.isArray(JSON.parse(output).searchTerms)`,
        },
      ],
    },
    tests: ["file://tests/refine-search.yaml"],
  };
}
