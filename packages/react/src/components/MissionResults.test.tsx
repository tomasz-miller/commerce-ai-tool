import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { resolveCommerceAISearchMessages } from "@commerce-ai-tool/core";
import type { MissionSearchResult } from "@commerce-ai-tool/core";
import { MissionResults } from "./MissionResults.js";

const messages = resolveCommerceAISearchMessages();

const mission: MissionSearchResult = {
  interpretation: "racket and balls",
  intents: [
    {
      intent: {
        id: "intent-0",
        label: "tennis racket",
        quantity: 1,
        searchTerms: ["tennis racket"],
      },
      products: [
        { id: "p1", name: "Pro Racket", sku: "RACKET-1", price: { amount: 80, currency: "EUR", formatted: "€80" } },
        { id: "p2", name: "Club Racket", sku: "RACKET-2", price: { amount: 40, currency: "EUR", formatted: "€40" } },
      ],
      total: 2,
    },
    {
      intent: {
        id: "intent-1",
        label: "golf balls",
        quantity: 2,
        searchTerms: ["golf balls"],
      },
      products: [
        { id: "p3", name: "Tour Balls", sku: "BALL-1", price: { amount: 20, currency: "EUR", formatted: "€20" } },
      ],
      total: 1,
    },
  ],
};

describe("MissionResults", () => {
  it("groups products and adds selected quantities", async () => {
    const onAddAll = vi.fn().mockResolvedValue({ id: "cart-1" });
    render(
      <MissionResults
        mission={mission}
        messages={messages}
        enableCart
        isMutating={false}
        onAddAll={onAddAll}
      />,
    );

    expect(screen.getByText("tennis racket")).toBeTruthy();
    expect(screen.getByText("golf balls")).toBeTruthy();
    expect(screen.getByText("Qty 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Select this product: Club Racket/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add all to cart/i }));

    expect(onAddAll).toHaveBeenCalledWith([
      { sku: "RACKET-2", quantity: 1 },
      { sku: "BALL-1", quantity: 2 },
    ]);
  });

  it("opens the product callback only when the selected card is clicked again", () => {
    const onProductSelect = vi.fn();
    render(
      <MissionResults
        mission={mission}
        messages={messages}
        enableCart={false}
        isMutating={false}
        onProductSelect={onProductSelect}
        onAddAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Select this product: Club Racket/i }));
    expect(onProductSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Club Racket" }));
    expect(onProductSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p2", sku: "RACKET-2" }),
    );
  });

  it("renders empty and failed intent states", () => {
    render(
      <MissionResults
        mission={{
          interpretation: "partial",
          intents: [
            {
              intent: {
                id: "intent-0",
                label: "missing",
                quantity: 1,
                searchTerms: ["missing"],
              },
              products: [],
              total: 0,
            },
            {
              intent: {
                id: "intent-1",
                label: "failed",
                quantity: 1,
                searchTerms: ["failed"],
              },
              products: [],
              total: 0,
              failed: true,
            },
          ],
        }}
        messages={messages}
        enableCart={false}
        isMutating={false}
        onAddAll={vi.fn()}
      />,
    );

    expect(screen.getByText(messages.missionIntentEmpty)).toBeTruthy();
    expect(screen.getByText(messages.missionIntentFailed)).toBeTruthy();
  });
});
