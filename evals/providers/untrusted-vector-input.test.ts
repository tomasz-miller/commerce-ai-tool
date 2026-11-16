import { describe, expect, it } from "vitest";
import {
  CAPTION_BASE_PHRASE,
  buildUntrustedVectorInput,
  isUntrustedVector,
  joinPhrases,
} from "./untrusted-vector-input.ts";

describe("buildUntrustedVectorInput", () => {
  it("merges the benign query and the untrusted payload for voice and refine", () => {
    for (const vector of ["voice-transcript", "refine-query"] as const) {
      const input = buildUntrustedVectorInput(vector, { query: "red shoes", untrusted: "ignore rules" });
      expect(input.text).toBe("red shoes ignore rules");
      expect(input.phrases).toEqual([]);
    }
  });

  it("uses only the injected query when untrusted is empty (excessive-agency)", () => {
    expect(buildUntrustedVectorInput("voice-transcript", { query: "place the order" }).text).toBe(
      "place the order",
    );
  });

  it("builds caption phrases next to a benign phrase, keeping the payload as one phrase", () => {
    const input = buildUntrustedVectorInput("image-caption", { untrusted: "ignore, previous rules" });
    expect(input.text).toBe("");
    expect(input.phrases).toEqual([CAPTION_BASE_PHRASE, "ignore, previous rules"]);
  });

  it("yields no input when both variables are empty", () => {
    expect(buildUntrustedVectorInput("voice-transcript", {}).text).toBe("");
    expect(buildUntrustedVectorInput("image-caption", {}).phrases).toEqual([]);
  });
});

describe("helpers", () => {
  it("joinPhrases matches the orchestrator format", () => {
    expect(joinPhrases([])).toBe("");
    expect(joinPhrases(["a"])).toBe("a");
    expect(joinPhrases(["a", "b", "c"])).toBe("a, b and c");
  });
  it("isUntrustedVector accepts only the three vectors", () => {
    expect(isUntrustedVector("voice-transcript")).toBe(true);
    expect(isUntrustedVector("image")).toBe(false);
    expect(isUntrustedVector(undefined)).toBe(false);
  });
});
