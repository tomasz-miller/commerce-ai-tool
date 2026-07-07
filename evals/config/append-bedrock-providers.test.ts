import { afterEach, describe, expect, it } from "vitest";
import { appendBedrockProvidersIfAvailable } from "./append-bedrock-providers.ts";

const BASE = {
  id: "file://providers/text-search-provider.ts",
  label: "openrouter",
  config: { provider: "openrouter" },
} as const;

const BEDROCK = {
  id: "file://providers/text-search-provider.ts",
  label: "bedrock",
  config: { provider: "bedrock" },
} as const;

describe("appendBedrockProvidersIfAvailable", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("returns only base providers when AWS_REGION is unset", () => {
    delete process.env.AWS_REGION;
    const providers = appendBedrockProvidersIfAvailable([BASE], [BEDROCK]);
    expect(providers).toHaveLength(1);
    expect(providers[0]?.label).toBe("openrouter");
  });

  it("appends Bedrock providers when AWS_REGION is set", () => {
    process.env.AWS_REGION = "eu-west-1";
    const providers = appendBedrockProvidersIfAvailable([BASE], [BEDROCK]);
    expect(providers).toHaveLength(2);
    expect(providers[1]?.label).toBe("bedrock");
  });
});
