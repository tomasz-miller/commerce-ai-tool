import { afterEach, describe, expect, it } from "vitest";
import {
  parseConfidenceEnv,
  parseEnumEnv,
  parsePositiveIntEnv,
} from "./env.js";

const NAME = "CAT_TEST_ENV_VALUE";

afterEach(() => {
  delete process.env[NAME];
});

describe("parsePositiveIntEnv", () => {
  it("returns the fallback when unset or empty", () => {
    expect(parsePositiveIntEnv(NAME, 20)).toBe(20);
    process.env[NAME] = "";
    expect(parsePositiveIntEnv(NAME, 20)).toBe(20);
    process.env[NAME] = "   ";
    expect(parsePositiveIntEnv(NAME, 20)).toBe(20);
  });

  it("returns undefined for an unset variable without a fallback", () => {
    expect(parsePositiveIntEnv(NAME, undefined)).toBeUndefined();
  });

  it("parses positive integers", () => {
    process.env[NAME] = " 500 ";
    expect(parsePositiveIntEnv(NAME, 20)).toBe(500);
  });

  it("throws on CAT_CACHE_MAX_ENTRIES=abc", () => {
    process.env.CAT_CACHE_MAX_ENTRIES = "abc";
    try {
      expect(() => parsePositiveIntEnv("CAT_CACHE_MAX_ENTRIES", 500)).toThrow(
        "Invalid CAT_CACHE_MAX_ENTRIES",
      );
    } finally {
      delete process.env.CAT_CACHE_MAX_ENTRIES;
    }
  });

  it.each(["abc", "0", "-5", "1.5", "NaN", "Infinity", "12px"])("throws on %s", (value) => {
    process.env[NAME] = value;
    expect(() => parsePositiveIntEnv(NAME, 20)).toThrow(`Invalid ${NAME}`);
  });

  it("accepts zero only with allowZero", () => {
    process.env[NAME] = "0";
    expect(parsePositiveIntEnv(NAME, 60, { allowZero: true })).toBe(0);
    process.env[NAME] = "-1";
    expect(() => parsePositiveIntEnv(NAME, 60, { allowZero: true })).toThrow(`Invalid ${NAME}`);
  });
});

describe("parseConfidenceEnv", () => {
  it("parses a number between 0 and 1 and defaults to undefined", () => {
    expect(parseConfidenceEnv(NAME)).toBeUndefined();
    process.env[NAME] = "0.6";
    expect(parseConfidenceEnv(NAME)).toBe(0.6);
  });

  it.each(["abc", "1.5", "-0.1", "NaN"])("throws on %s", (value) => {
    process.env[NAME] = value;
    expect(() => parseConfidenceEnv(NAME)).toThrow(`Invalid ${NAME}`);
  });
});

describe("parseEnumEnv", () => {
  const providers = ["openrouter", "bedrock"] as const;

  it("returns the fallback when unset or empty", () => {
    expect(parseEnumEnv(NAME, providers, "openrouter")).toBe("openrouter");
    process.env[NAME] = "";
    expect(parseEnumEnv(NAME, providers, "openrouter")).toBe("openrouter");
  });

  it("returns undefined for an unset variable without a fallback", () => {
    expect(parseEnumEnv(NAME, providers)).toBeUndefined();
  });

  it("returns an allowed value", () => {
    process.env[NAME] = " bedrock ";
    expect(parseEnumEnv(NAME, providers, "openrouter")).toBe("bedrock");
  });

  it("throws on CAT_AI_PROVIDER=gpt and names the allowed values", () => {
    process.env.CAT_AI_PROVIDER = "gpt";
    try {
      expect(() => parseEnumEnv("CAT_AI_PROVIDER", providers, "openrouter")).toThrow(
        /Invalid CAT_AI_PROVIDER.*openrouter, bedrock/,
      );
    } finally {
      delete process.env.CAT_AI_PROVIDER;
    }
  });
});
