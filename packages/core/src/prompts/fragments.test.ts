import { describe, expect, it } from "vitest";
import {
  IMAGE_QUERY_SYSTEM_PROMPT,
  REFINE_QUERY_SYSTEM_PROMPT,
  TEXT_QUERY_SYSTEM_PROMPT,
  VOICE_AUDIO_INTERPRET_SYSTEM_PROMPT,
} from "./index.js";
import { FILTER_RULES, SAFETY_RULES, SEARCH_TERMS_RULES } from "./fragments.js";

describe("prompt fragments", () => {
  it("embeds shared search-term and safety rules in text, image, and voice prompts", () => {
    for (const prompt of [
      TEXT_QUERY_SYSTEM_PROMPT,
      IMAGE_QUERY_SYSTEM_PROMPT,
      VOICE_AUDIO_INTERPRET_SYSTEM_PROMPT,
    ]) {
      expect(prompt).toContain(SEARCH_TERMS_RULES.slice(0, 80));
      expect(prompt).toContain(SAFETY_RULES.slice(0, 40));
      expect(prompt).toContain("primaryTerm");
    }
  });

  it("includes filter rules in the image prompt", () => {
    expect(IMAGE_QUERY_SYSTEM_PROMPT).toContain(FILTER_RULES.slice(0, 40));
  });

  it("gives refine its own merge semantics", () => {
    expect(REFINE_QUERY_SYSTEM_PROMPT).toContain("refining an existing product search");
    expect(REFINE_QUERY_SYSTEM_PROMPT).toContain("Do not invent priceMax");
  });
});
