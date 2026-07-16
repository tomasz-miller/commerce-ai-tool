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
});
