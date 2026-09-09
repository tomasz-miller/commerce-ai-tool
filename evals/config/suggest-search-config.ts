export default function suggestSearchConfig() {
  return {
    description: "Commerce AI — autocomplete suggestion evals",
    prompts: ["{{query}}"],
    providers: [
      {
        id: "file://providers/suggest-search-provider.ts",
        label: "openrouter-gpt-56-luna",
        config: {
          provider: "openrouter",
          model: "openai/gpt-5.6-luna",
        },
      },
    ],
    defaultTest: {
      assert: [
        {
          type: "javascript",
          value: `Array.isArray(JSON.parse(output).suggestions)`,
        },
      ],
    },
    tests: ["file://tests/suggest-search.yaml"],
  };
}
