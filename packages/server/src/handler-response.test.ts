import { describe, expect, it } from "vitest";
import { toWebErrorResponse, toWebResponse } from "./handler-response.js";

describe("handler-response", () => {
  it("toWebResponse maps JSON handler responses", async () => {
    const response = toWebResponse({
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ok" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("toWebResponse maps binary handler responses", () => {
    const response = toWebResponse({
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
      body: Buffer.from("audio"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("toWebErrorResponse returns JSON error payload", async () => {
    const response = toWebErrorResponse("Search failed", 500);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Search failed" });
  });
});
