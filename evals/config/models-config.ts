/**
 * Side-by-side cheaper-model matrix on the retrieval suite.
 * Run: pnpm eval:models
 */
export default function modelsConfig() {
  return {
    description: "Commerce AI — model cost vs retrieval quality",
    prompts: ["{{query}}"],
    providers: [
      {
        id: "file://providers/retrieval-search-provider.ts",
        label: "openai-gpt-56-luna",
        config: { provider: "openrouter", model: "openai/gpt-5.6-luna" },
      },
      {
        id: "file://providers/retrieval-search-provider.ts",
        label: "google-gemini-37-flash",
        config: { provider: "openrouter", model: "google/gemini-3.7-flash" },
      },
      {
        id: "file://providers/retrieval-search-provider.ts",
        label: "openai-gpt-41-mini",
        config: { provider: "openrouter", model: "openai/gpt-4.1-mini" },
      },
      {
        id: "file://providers/retrieval-search-provider.ts",
        label: "google-gemini-25-flash",
        config: { provider: "openrouter", model: "google/gemini-2.5-flash" },
      },
    ],
    defaultTest: {
      assert: [
        {
          type: "javascript",
          value: `JSON.parse(output).total > 0`,
        },
      ],
    },
    tests: ["file://tests/retrieval.yaml"],
  };
}
