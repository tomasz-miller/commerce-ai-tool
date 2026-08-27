import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { resolveCommerceAISearchMessages } from "@commerce-ai-tool/core";
import { SearchFacets } from "./SearchFacets.js";

describe("SearchFacets", () => {
  const messages = resolveCommerceAISearchMessages();

  it("maps price chips to priceMin/priceMax filters", () => {
    const onChange = vi.fn();

    render(
      <SearchFacets
        facets={[
          {
            id: "price",
            label: "Price",
            type: "range",
            buckets: [{ key: "under-50", label: "under-50", count: 3 }],
          },
        ]}
        suggestedFacets={[{ name: "price" }]}
        filters={{}}
        messages={messages}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /under-50/ }));
    expect(onChange).toHaveBeenCalledWith({ priceMax: "50" });
  });

  it("exposes a new search action", () => {
    const onNewSearch = vi.fn();

    render(
      <SearchFacets
        facets={[
          {
            id: "color",
            label: "Color",
            type: "distinct",
            buckets: [{ key: "red", label: "red", count: 1 }],
          },
        ]}
        suggestedFacets={[{ name: "color" }]}
        filters={{}}
        messages={messages}
        onChange={vi.fn()}
        onNewSearch={onNewSearch}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: messages.newSearch }));
    expect(onNewSearch).toHaveBeenCalled();
  });

  it("renders a color swatch for hex facet keys", () => {
    render(
      <SearchFacets
        facets={[
          {
            id: "color-code",
            label: "Colour Code",
            type: "distinct",
            buckets: [{ key: "#FFFFFF", label: "White", count: 2 }],
          },
        ]}
        suggestedFacets={[{ name: "color-code" }]}
        filters={{}}
        messages={messages}
        onChange={vi.fn()}
      />,
    );

    const chip = screen.getByRole("button", { name: /White/ });
    const swatch = chip.querySelector(".cat-facet-chip__swatch");
    expect(swatch).toBeInstanceOf(HTMLElement);
    expect((swatch as HTMLElement).style.backgroundColor).toBe("rgb(255, 255, 255)");
  });

  it("does not render a color swatch on non-color hex keys", () => {
    render(
      <SearchFacets
        facets={[
          {
            id: "sku",
            label: "SKU",
            type: "distinct",
            buckets: [{ key: "#FFFFFF", label: "#FFFFFF", count: 1 }],
          },
        ]}
        suggestedFacets={[{ name: "sku" }]}
        filters={{}}
        messages={messages}
        onChange={vi.fn()}
      />,
    );

    const chip = screen.getByRole("button", { name: /#FFFFFF/ });
    expect(chip.querySelector(".cat-facet-chip__swatch")).toBeNull();
  });
});
