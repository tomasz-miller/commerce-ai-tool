import { describe, expect, it } from "vitest";
import { defaultDemoConfig } from "./demo-config.js";

describe("defaultDemoConfig", () => {
  it("points at the shared BFF with demo defaults", () => {
    expect(defaultDemoConfig()).toEqual({
      apiBaseUrl: "/api/commerce-ai",
      theme: "light",
      currency: "EUR",
      country: "DE",
    });
  });
});
