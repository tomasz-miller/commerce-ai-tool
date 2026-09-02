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
  it("adds the first product from each filled lane at quantity 1", async () => {
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
    expect(screen.getByText("Looking for 2")).toBeTruthy();
    expect(screen.queryByText("Looking for 1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Add all to cart/i }));

    expect(onAddAll).toHaveBeenCalledWith([
      { sku: "RACKET-1", quantity: 1 },
      { sku: "BALL-1", quantity: 1 },
    ]);
  });

  it("adds a single card and opens PDP on the first card click", () => {
    const onProductSelect = vi.fn();
    const onAddItem = vi.fn();
    render(
      <MissionResults
        mission={mission}
        messages={messages}
        enableCart
        isMutating={false}
        onProductSelect={onProductSelect}
        onAddItem={onAddItem}
        onAddAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Club Racket/i }));
    expect(onProductSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p2", sku: "RACKET-2" }),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Add to cart" })[1]!);
    expect(onAddItem).toHaveBeenCalledWith(expect.objectContaining({ id: "p2", sku: "RACKET-2" }));
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

  it("skips empty and failed lanes and dedupes duplicate first products on add all", () => {
    const onAddAll = vi.fn().mockResolvedValue({ id: "cart-1" });
    render(
      <MissionResults
        mission={{
          interpretation: "mixed",
          intents: [
            {
              intent: { id: "intent-0", label: "glasses", quantity: 1, searchTerms: ["glasses"] },
              products: [{ id: "p1", name: "Wine Glass", sku: "GLASS-1" }],
              total: 1,
            },
            {
              intent: { id: "intent-1", label: "missing", quantity: 1, searchTerms: ["missing"] },
              products: [],
              total: 0,
            },
            {
              intent: { id: "intent-2", label: "failed", quantity: 1, searchTerms: ["failed"] },
              products: [],
              total: 0,
              failed: true,
            },
            {
              intent: { id: "intent-3", label: "more glasses", quantity: 1, searchTerms: ["glasses"] },
              products: [{ id: "p9", name: "Same Glass", sku: "GLASS-1" }],
              total: 1,
            },
          ],
        }}
        messages={messages}
        enableCart
        isMutating={false}
        onAddAll={onAddAll}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add all to cart/i }));
    expect(onAddAll).toHaveBeenCalledWith([{ sku: "GLASS-1", quantity: 1 }]);
  });

  it("renders product cards as non-buttons when onProductSelect is omitted", () => {
    render(
      <MissionResults
        mission={mission}
        messages={messages}
        enableCart={false}
        isMutating={false}
        onAddAll={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Pro Racket/i })).toBeNull();
    expect(screen.getByText("Pro Racket")).toBeTruthy();
  });
});
