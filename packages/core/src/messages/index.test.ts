import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
  resolveCommerceAISearchMessages,
} from "./index.js";

describe("resolveCommerceAISearchMessages", () => {
  it("returns defaults when no overrides are provided", () => {
    expect(resolveCommerceAISearchMessages()).toEqual(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES);
  });

  it("merges partial overrides", () => {
    expect(
      resolveCommerceAISearchMessages({
        placeholder: "Szukaj produktów",
        searching: "Szukam...",
      }),
    ).toEqual({
      ...DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
      placeholder: "Szukaj produktów",
      searching: "Szukam...",
    });
  });
});
