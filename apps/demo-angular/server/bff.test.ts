import { describe, expect, it } from "vitest";
import { createMockPaymentProvider } from "./mock-payment-provider.js";
import {
  DEMO_BFF_BASE_PATH,
  DEMO_BFF_DEFAULT_HOST,
  DEMO_BFF_DEFAULT_PORT,
  resolveBffHost,
  resolveBffPort,
} from "./bff.js";

describe("mock-payment-provider", () => {
  it("lists the demo credit-card method", async () => {
    const methods = await createMockPaymentProvider().listMethods({
      locale: "en-GB",
      country: "DE",
    });
    expect(methods).toEqual([
      {
        method: "CREDIT_CARD",
        name: "Credit card",
        description: "Demo authorization — no real charge",
      },
    ]);
  });

  it("authorizes payments without a real charge", async () => {
    const result = await createMockPaymentProvider().authorize({
      cartId: "cart-1",
      orderNumber: "cat-1",
      method: "CREDIT_CARD",
      amount: { centAmount: 9900, currencyCode: "EUR" },
      locale: "en-GB",
    });
    expect(result).toEqual({ status: "authorized", interfaceId: "mock-cat-1" });
  });

  it("fails the insufficient-funds probe amount", async () => {
    const result = await createMockPaymentProvider().authorize({
      cartId: "cart-1",
      orderNumber: "cat-2",
      method: "CREDIT_CARD",
      amount: { centAmount: 1313, currencyCode: "EUR" },
      locale: "en-GB",
    });
    expect(result.status).toBe("failed");
  });
});

describe("demo BFF wiring", () => {
  it("mounts every route under the shared base path", () => {
    expect(DEMO_BFF_BASE_PATH).toBe("/api/commerce-ai");
  });

  it("resolves the BFF port with a safe fallback", () => {
    expect(resolveBffPort({ BFF_PORT: "3002" } as NodeJS.ProcessEnv)).toBe(3002);
    expect(resolveBffPort({} as NodeJS.ProcessEnv)).toBe(DEMO_BFF_DEFAULT_PORT);
    expect(resolveBffPort({ BFF_PORT: "not-a-port" } as NodeJS.ProcessEnv)).toBe(
      DEMO_BFF_DEFAULT_PORT,
    );
  });

  it("binds the BFF to loopback unless BFF_HOST is set", () => {
    expect(resolveBffHost({} as NodeJS.ProcessEnv)).toBe(DEMO_BFF_DEFAULT_HOST);
    expect(resolveBffHost({ BFF_HOST: "  " } as NodeJS.ProcessEnv)).toBe(DEMO_BFF_DEFAULT_HOST);
    expect(resolveBffHost({ BFF_HOST: "0.0.0.0" } as NodeJS.ProcessEnv)).toBe("0.0.0.0");
  });
});
