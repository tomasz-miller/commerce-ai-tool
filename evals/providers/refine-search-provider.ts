import type { CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";
import type { InterpretedSearchFilters } from "@commerce-ai-tool/core";
import {
  DEFAULT_CATALOG_LOCALE,
  createEvalAIProvider,
  createSkippedProviderResponse,
  loadEvalEnvFile,
  parseAttributeCatalog,
  readProviderConfig,
  toEvalProviderResponse,
} from "./eval-utils.ts";

loadEvalEnvFile();

function parseSearchTerms(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [value];
    } catch {
      return [value];
    }
  }
  return [];
}

function parseFilters(value: unknown): InterpretedSearchFilters {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as InterpretedSearchFilters;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      return JSON.parse(value) as InterpretedSearchFilters;
    } catch {
      return {};
    }
  }
  return {};
}

export default class RefineSearchEvalProvider {
  private readonly providerId: string;
  private readonly evalProvider;

  constructor(options: ProviderOptions) {
    this.providerId = options.id ?? "commerce-refine-search";
    this.evalProvider = createEvalAIProvider(readProviderConfig(options));
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (this.evalProvider.skipped) {
      return createSkippedProviderResponse(this.evalProvider.skipReason ?? "Provider unavailable");
    }

    const vars = context?.vars ?? {};
    const refineQuery = String(vars.refineQuery ?? vars.query ?? "");
    const catalogLocale = String(vars.catalogLocale ?? DEFAULT_CATALOG_LOCALE);
    const queryLocale = String(vars.queryLocale ?? catalogLocale);
    const searchTerms = parseSearchTerms(vars.searchTerms);
    const filters = parseFilters(vars.filters);

    if (!refineQuery) {
      return { error: "Missing test variable: refineQuery" };
    }
    if (searchTerms.length === 0) {
      return { error: "Missing test variable: searchTerms" };
    }

    try {
      const startedAt = Date.now();
      const result = await this.evalProvider.ai!.interpretRefineQuery(
        refineQuery,
        {
          searchTerms,
          filters,
          attributeCatalog: parseAttributeCatalog(vars),
        },
        { queryLocale, catalogLocale },
      );

      return toEvalProviderResponse(result, this.evalProvider.ai!, startedAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  }
}
