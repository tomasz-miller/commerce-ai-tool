import { InvalidCredentialsError } from "@commerce-ai-tool/core";
import type { CartSnapshot, CommercetoolsClient, SearchOrchestrator } from "@commerce-ai-tool/core";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOGIN_RATE_LIMIT_MESSAGE } from "./login-rate-limit.js";
import { createExpressRouter } from "./express.js";
import type { CommerceAIServer } from "./server.js";

vi.mock("./server.js", () => ({
  createCommerceAIServer: vi.fn(),
}));

import { createCommerceAIServer } from "./server.js";

const sampleCart: CartSnapshot = {
  id: "cart-1",
  version: 1,
  anonymousId: "anon-1",
  lineItems: [],
  totalPrice: { amount: 0, currency: "EUR", formatted: "€0.00" },
  totalQuantity: 0,
};

function createMockServer(): CommerceAIServer {
  return {
    orchestrator: {
      searchByText: vi.fn(),
      searchByVoice: vi.fn(),
      searchByImage: vi.fn(),
      suggestByText: vi.fn(),
    } as unknown as SearchOrchestrator,
    commercetools: {
      getCart: vi.fn().mockResolvedValue(sampleCart),
      getCustomerCart: vi.fn().mockResolvedValue(sampleCart),
      addToCart: vi.fn().mockResolvedValue(sampleCart),
      removeLineItem: vi.fn().mockResolvedValue(sampleCart),
      changeLineItemQuantity: vi.fn().mockResolvedValue(sampleCart),
      loginAndMerge: vi.fn(),
    } as unknown as CommercetoolsClient,
    cartDefaults: { currency: "EUR", catalogLocale: "en" },
    cartSessionSecret: "test-secret",
    transcribeAudio: vi.fn(),
    synthesizeSpeech: vi.fn(),
  };
}

describe("createExpressRouter login rate limit", () => {
  afterEach(() => {
    vi.mocked(createCommerceAIServer).mockReset();
  });

  it("returns 429 after the login attempt limit", async () => {
    const server = createMockServer();
    vi.mocked(server.commercetools.loginAndMerge).mockRejectedValue(new InvalidCredentialsError());
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const app = express();
    app.use(
      createExpressRouter({
        config: {} as never,
        loginRateLimit: { windowMs: 60_000, limit: 2 },
      }),
    );

    await request(app)
      .post("/cart/login")
      .send({ email: "ada@example.com", password: "wrong" })
      .expect(401);
    await request(app)
      .post("/cart/login")
      .send({ email: "ada@example.com", password: "wrong" })
      .expect(401);

    const limited = await request(app)
      .post("/cart/login")
      .send({ email: "ada@example.com", password: "wrong" });

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: LOGIN_RATE_LIMIT_MESSAGE });
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(server.commercetools.loginAndMerge).toHaveBeenCalledTimes(2);
  });
});
