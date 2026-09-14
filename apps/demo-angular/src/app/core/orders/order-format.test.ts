import { describe, expect, it } from "vitest";
import { formatOrderAddress, formatPlacedAt, orderHref } from "./order-format.js";

describe("order-format", () => {
  it("formats placement timestamps in UTC", () => {
    expect(formatPlacedAt("2026-09-10T13:41:00.000Z")).toBe("2026-09-10 13:41 UTC");
    expect(formatPlacedAt("not-a-date")).toBe("not-a-date");
  });

  it("joins address lines and skips the optional line", () => {
    expect(
      formatOrderAddress({
        firstName: "Ada",
        lastName: "Lovelace",
        streetName: "Main Street",
        postalCode: "10115",
        city: "Berlin",
        country: "DE",
      }),
    ).toBe("Ada Lovelace, Main Street, 10115 Berlin, DE");
  });

  it("appends the order number with the right separator", () => {
    expect(orderHref("/orders", "cat-1")).toBe("/orders?orderNumber=cat-1");
    expect(orderHref("/orders?tab=all", "cat 2")).toBe("/orders?tab=all&orderNumber=cat%202");
  });
});
