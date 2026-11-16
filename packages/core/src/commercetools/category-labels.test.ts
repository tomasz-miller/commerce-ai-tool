import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CATEGORY_NAMES_GRAPHQL_QUERY,
  CategoryLabelCache,
  _resetCategoryLabelWarningForTests,
  buildCategoryIdsWhere,
  parseCategoryNamesResponse,
} from "./category-labels.js";

describe("CategoryLabelCache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches missing ids in one batch and serves repeats from the cache", async () => {
    const fetchNames = vi.fn().mockResolvedValue({ "cat-1": "Shoes", "cat-2": "Bags" });
    const cache = new CategoryLabelCache(fetchNames);

    expect(await cache.resolve(["cat-1", "cat-2"], "en")).toEqual({ "cat-1": "Shoes", "cat-2": "Bags" });
    expect(await cache.resolve(["cat-2", "cat-1"], "en")).toEqual({ "cat-1": "Shoes", "cat-2": "Bags" });
    expect(fetchNames).toHaveBeenCalledTimes(1);
    expect(fetchNames).toHaveBeenCalledWith(["cat-1", "cat-2"], "en");
  });

  it("keys entries by locale", async () => {
    const fetchNames = vi
      .fn()
      .mockResolvedValueOnce({ "cat-1": "Shoes" })
      .mockResolvedValueOnce({ "cat-1": "Sko" });
    const cache = new CategoryLabelCache(fetchNames);

    expect(await cache.resolve(["cat-1"], "en")).toEqual({ "cat-1": "Shoes" });
    expect(await cache.resolve(["cat-1"], "no")).toEqual({ "cat-1": "Sko" });
  });

  it("refetches after the TTL", async () => {
    vi.useFakeTimers();
    const fetchNames = vi.fn().mockResolvedValue({ "cat-1": "Shoes" });
    const cache = new CategoryLabelCache(fetchNames, { ttlMs: 1_000 });

    await cache.resolve(["cat-1"], "en");
    vi.advanceTimersByTime(1_001);
    await cache.resolve(["cat-1"], "en");
    expect(fetchNames).toHaveBeenCalledTimes(2);
  });

  it("is bounded", async () => {
    const fetchNames = vi.fn((ids: string[]) =>
      Promise.resolve(Object.fromEntries(ids.map((id) => [id, `name-${id}`]))),
    );
    const cache = new CategoryLabelCache(fetchNames, { maxEntries: 2 });

    await cache.resolve(["a", "b", "c"], "en");
    await cache.resolve(["a"], "en");
    // "a" was evicted when "c" was stored.
    expect(fetchNames).toHaveBeenCalledTimes(2);
  });

  it("returns the cached names and no error when the lookup fails", async () => {
    const fetchNames = vi
      .fn()
      .mockResolvedValueOnce({ "cat-1": "Shoes" })
      .mockRejectedValueOnce(new Error("boom"));
    const cache = new CategoryLabelCache(fetchNames);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await cache.resolve(["cat-1"], "en");
    expect(await cache.resolve(["cat-1", "cat-2"], "en")).toEqual({ "cat-1": "Shoes" });
    warn.mockRestore();
  });

  it("never sends an id that is not a plain identifier to the predicate", async () => {
    const fetchNames = vi.fn().mockResolvedValue({});
    const cache = new CategoryLabelCache(fetchNames);
    await cache.resolve(['x") or (id is defined', "cat-1"], "en");
    expect(fetchNames).toHaveBeenCalledWith(["cat-1"], "en");
  });

  it("does not call the lookup for an empty id list", async () => {
    const fetchNames = vi.fn();
    const cache = new CategoryLabelCache(fetchNames);
    expect(await cache.resolve([], "en")).toEqual({});
    expect(fetchNames).not.toHaveBeenCalled();
  });
});

describe("CategoryLabelCache negative caching", () => {
  beforeEach(() => {
    _resetCategoryLabelWarningForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    _resetCategoryLabelWarningForTests();
  });

  it("a failing category lookup is not retried within the negative TTL", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchNames = vi.fn().mockRejectedValue(new Error("forbidden"));
    const cache = new CategoryLabelCache(fetchNames, { negativeTtlMs: 60_000 });

    expect(await cache.resolve(["cat-1"], "en")).toEqual({});
    vi.advanceTimersByTime(59_000);
    expect(await cache.resolve(["cat-1"], "en")).toEqual({});
    expect(fetchNames).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2_000);
    await cache.resolve(["cat-1"], "en");
    expect(fetchNames).toHaveBeenCalledTimes(2);
    // One warning per process, not one per search.
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not refetch an id the lookup returned no name for within the negative TTL", async () => {
    const fetchNames = vi.fn().mockResolvedValue({ "cat-1": "Shoes" });
    const cache = new CategoryLabelCache(fetchNames);

    await cache.resolve(["cat-1", "cat-gone"], "en");
    expect(await cache.resolve(["cat-1", "cat-gone"], "en")).toEqual({ "cat-1": "Shoes" });
    expect(fetchNames).toHaveBeenCalledTimes(1);
  });
});

describe("parseCategoryNamesResponse", () => {
  it("maps results to id -> name", () => {
    expect(
      parseCategoryNamesResponse({
        data: { categories: { results: [{ id: "a", name: "Shoes" }, { id: "b", name: null }, null] } },
      }),
    ).toEqual({ a: "Shoes" });
  });

  it("treats errors with null data as a failure", () => {
    expect(() =>
      parseCategoryNamesResponse({ data: null, errors: [{ message: "Insufficient scope" }] }),
    ).toThrow("Insufficient scope");
  });
});

describe("category name query", () => {
  it("uses acceptLanguage on the localized name and an id-in predicate", () => {
    expect(CATEGORY_NAMES_GRAPHQL_QUERY).toContain("categories(where: $where, limit: $limit)");
    expect(CATEGORY_NAMES_GRAPHQL_QUERY).toContain("name(acceptLanguage: $locales)");
    expect(buildCategoryIdsWhere(["a", "b"])).toBe('id in ("a","b")');
  });
});
