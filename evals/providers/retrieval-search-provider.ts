import type { CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";
import { buildProductSearchRequest } from "@commerce-ai-tool/core";
import {
  createEvalAIProvider,
  createEvalCommercetoolsClient,
  createSkippedProviderResponse,
  isCommercetoolsAvailable,
  loadCommercetoolsEvalEnv,
  parseAttributeCatalog,
  readProviderConfig,
  toEvalProviderResponse,
} from "./eval-utils.ts";

loadCommercetoolsEvalEnv();

const DEFAULT_RETRIEVAL_LOCALE = "en-GB";

export default class RetrievalSearchEvalProvider {
  private readonly providerId: string;
  private readonly evalProvider;

  constructor(options: ProviderOptions) {
    this.providerId = options.id ?? "commerce-retrieval-search";
    this.evalProvider = createEvalAIProvider(readProviderConfig(options));
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (this.evalProvider.skipped) {
      return createSkippedProviderResponse(this.evalProvider.skipReason ?? "Provider unavailable");
    }
    if (!isCommercetoolsAvailable()) {
      return createSkippedProviderResponse("CTP_* credentials not configured");
    }

    const vars = context?.vars ?? {};
    const query = String(vars.query ?? "");
    const catalogLocale = String(vars.catalogLocale ?? DEFAULT_RETRIEVAL_LOCALE);
    const queryLocale = String(vars.queryLocale ?? catalogLocale);
    const expectedSkus = parseStringList(vars.expectedSkus);
    const k = Number(vars.k ?? 5);

    if (!query) {
      return { error: "Missing test variable: query" };
    }

    try {
      const startedAt = Date.now();
      const interpreted = await this.evalProvider.ai!.interpretTextQuery(
        query,
        { queryLocale, catalogLocale },
        parseAttributeCatalog(vars),
      );

      const ct = createEvalCommercetoolsClient();
      const searchInput = {
        interpreted,
        catalogLocale,
        limit: 10,
        offset: 0,
        options: { currency: process.env.CAT_DEFAULT_CURRENCY ?? "EUR" },
      };
      const built = buildProductSearchRequest(searchInput);
      const searchResult = await ct.searchProducts(searchInput, {
        locale: catalogLocale,
        currency: process.env.CAT_DEFAULT_CURRENCY ?? "EUR",
      });

      let products = searchResult.projections ?? [];
      if (products.length === 0 && searchResult.productIds.length > 0) {
        products = await ct.getProductProjections(
          searchResult.productIds,
          catalogLocale,
          process.env.CAT_DEFAULT_CURRENCY ?? "EUR",
          process.env.CAT_DEFAULT_COUNTRY,
        );
      }

      const top = products.slice(0, Number.isFinite(k) ? k : 5);
      const topSkus = top.map((product) => product.sku).filter((sku): sku is string => Boolean(sku));
      const hits = expectedSkus.filter((sku) => topSkus.includes(sku));
      const kUsed = top.length || 1;
      const precisionAtK =
        expectedSkus.length === 0 ? null : hits.length / kUsed;
      const recallAtK =
        expectedSkus.length === 0 ? null : hits.length / expectedSkus.length;

      return toEvalProviderResponse(
        {
          interpreted,
          total: searchResult.total,
          queryBody: built.query,
          products: top.map((product) => ({
            id: product.id,
            sku: product.sku,
            name: product.name,
          })),
          topSkus,
          expectedSkus,
          hits,
          precisionAtK,
          recallAtK,
        },
        this.evalProvider.ai!,
        startedAt,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  }
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}
