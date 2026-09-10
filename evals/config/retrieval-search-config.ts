export default function retrievalSearchConfig() {
  return {
    description: "Commerce AI — retrieval quality against a live commercetools catalog",
    prompts: ["{{query}}"],
    providers: [
      {
        id: "file://providers/retrieval-search-provider.ts",
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
          value: `(() => { try { JSON.parse(output); return true; } catch { return false; } })()`,
        },
        {
          type: "javascript",
          value: `JSON.parse(output).total > 0 && Array.isArray(JSON.parse(output).products)`,
        },
      ],
    },
    tests: ["file://tests/retrieval.yaml"],
  };
}
