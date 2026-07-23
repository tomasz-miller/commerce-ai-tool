import { logSearchTrace, SearchTimeoutError } from "@commerce-ai-tool/core";
import type {
  InterpretedSearchFilters,
  SuggestedFacet,
  VoiceSearchResult,
} from "@commerce-ai-tool/core";
import {
  clampSuggestionsLimit,
  normalizeSuggestionsPrefix,
} from "@commerce-ai-tool/core";
import { redactBinaryInput, withOptionalRequestSpan, withRequestSpan, shouldTraceSuggestions } from "./observability/langfuse.js";
import type { CommerceAIServer } from "./server.js";
import { logServerError, logServerWarning } from "./utils/log-error.js";
import { parseSearchLocaleOptions } from "./utils/locale.js";
import type { ParsedMultipart } from "./utils/multipart.js";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface SearchRequestBody {
  query: string;
  queryLocale?: string;
  catalogLocale?: string;
  locale?: string;
  limit?: number;
  filters?: InterpretedSearchFilters;
  searchTerms?: string[];
  sort?: "relevance" | "price_asc" | "price_desc";
  refineQuery?: string;
  includeFacets?: boolean;
  suggestedFacets?: SuggestedFacet[];
}

export interface SuggestionsRequestBody {
  query: string;
  queryLocale?: string;
  catalogLocale?: string;
  locale?: string;
  limit?: number;
}

export type VoiceSearchResponse = VoiceSearchResult & {
  ttsText?: string;
  audioSummary?: string;
  ttsPending: boolean;
};

export function mapRouteError(
  error: unknown,
  context: string,
  fallback: string,
  extra?: Record<string, unknown>,
): { message: string; status: number } {
  if (error instanceof SearchTimeoutError) {
    return { message: error.message, status: 504 };
  }

  if (error instanceof ValidationError) {
    return { message: error.message, status: 400 };
  }

  logServerError(context, error, extra);
  return {
    message: error instanceof Error ? error.message : fallback,
    status: 500,
  };
}

export async function executeSearch(
  server: CommerceAIServer,
  body: SearchRequestBody,
): Promise<unknown> {
  if (!body.query?.trim()) {
    throw new ValidationError("query is required");
  }
  if (body.refineQuery && (!body.searchTerms || body.searchTerms.length === 0)) {
    throw new ValidationError("searchTerms are required for a refinement");
  }

  const localeOptions = parseSearchLocaleOptions(body);
  logSearchTrace("handler", {
    type: "text",
    query: body.query,
    queryLocale: localeOptions.queryLocale,
    catalogLocale: localeOptions.catalogLocale,
  });

  return withRequestSpan(
    "commerce-ai.search",
    {
      input: { query: body.query, refineQuery: body.refineQuery },
      metadata: {
        searchType: "text",
        queryLocale: localeOptions.queryLocale ?? "",
        catalogLocale: localeOptions.catalogLocale ?? "",
      },
    },
    () =>
      server.orchestrator.searchByText({
        query: body.query,
        ...localeOptions,
        limit: body.limit,
        filters: body.filters,
        searchTerms: body.searchTerms,
        sort: body.sort,
        refineQuery: body.refineQuery,
        includeFacets: body.includeFacets,
        suggestedFacets: body.suggestedFacets,
      }),
  );
}

export async function executeFacetSchema(
  server: CommerceAIServer,
  options?: SearchRequestBody,
): Promise<unknown> {
  if (!server.orchestrator.getFacetSchema) {
    throw new Error("Facet schema is not available");
  }
  return server.orchestrator.getFacetSchema(options);
}

export async function executeSearchSuggestions(
  server: CommerceAIServer,
  body: SuggestionsRequestBody,
): Promise<unknown> {
  const normalizedQuery = normalizeSuggestionsPrefix(body.query ?? "");
  if (!normalizedQuery) {
    throw new ValidationError("query must be at least 2 characters");
  }

  const localeOptions = parseSearchLocaleOptions(body);
  logSearchTrace("handler", {
    type: "suggest",
    query: normalizedQuery,
    queryLocale: localeOptions.queryLocale,
    catalogLocale: localeOptions.catalogLocale,
  });

  return withOptionalRequestSpan(
    shouldTraceSuggestions(),
    "commerce-ai.search.suggestions",
    {
      input: { query: normalizedQuery },
      metadata: {
        searchType: "suggest",
        queryLocale: localeOptions.queryLocale ?? "",
        catalogLocale: localeOptions.catalogLocale ?? "",
      },
    },
    () =>
      server.orchestrator.suggestByText({
        query: normalizedQuery,
        ...localeOptions,
        limit: clampSuggestionsLimit(body.limit),
      }),
  );
}

export async function executeSearchVoice(
  server: CommerceAIServer,
  fields: Record<string, string>,
  file: ParsedMultipart["file"],
): Promise<VoiceSearchResponse> {
  if (!file) {
    throw new ValidationError("audio file is required");
  }

  const localeOptions = parseSearchLocaleOptions(fields);
  logSearchTrace("handler", {
    type: "voice",
    mimeType: file.mimeType,
    queryLocale: localeOptions.queryLocale,
    catalogLocale: localeOptions.catalogLocale,
  });

  return withRequestSpan(
    "commerce-ai.search.voice",
    {
      input: { audio: redactBinaryInput(file.mimeType, file.buffer) },
      metadata: {
        searchType: "voice",
        queryLocale: localeOptions.queryLocale ?? "",
        catalogLocale: localeOptions.catalogLocale ?? "",
      },
    },
    async () => {
      const result = await server.orchestrator.searchByVoice(
        new Uint8Array(file.buffer),
        file.mimeType,
        {
          ...localeOptions,
          limit: fields.limit ? Number(fields.limit) : undefined,
          enableTts: fields.enableTts !== "false",
        },
      );

      const blockingTts = fields.blockingTts === "true";
      let audioSummary: string | undefined;
      if (blockingTts && result.ttsText) {
        try {
          const audio = await server.synthesizeSpeech(result.ttsText);
          audioSummary = audio.toString("base64");
        } catch (error) {
          logServerWarning("searchVoice", "TTS summary skipped", {
            reason: error instanceof Error ? error.message : "unknown",
          });
        }
      }

      return {
        transcript: result.transcript,
        enhancedQuery: result.enhancedQuery,
        products: result.products,
        meta: result.meta,
        ttsText: result.ttsText,
        audioSummary,
        ttsPending: Boolean(result.ttsText && !audioSummary),
      };
    },
  );
}

export async function executeSearchImage(
  server: CommerceAIServer,
  fields: Record<string, string>,
  file: ParsedMultipart["file"],
): Promise<unknown> {
  if (!file) {
    throw new ValidationError("image file is required");
  }

  const localeOptions = parseSearchLocaleOptions(fields);
  logSearchTrace("handler", {
    type: "image",
    mimeType: file.mimeType,
    queryLocale: localeOptions.queryLocale,
    catalogLocale: localeOptions.catalogLocale,
  });

  return withRequestSpan(
    "commerce-ai.search.image",
    {
      input: { image: redactBinaryInput(file.mimeType, file.buffer) },
      metadata: {
        searchType: "image",
        queryLocale: localeOptions.queryLocale ?? "",
        catalogLocale: localeOptions.catalogLocale ?? "",
      },
    },
    () =>
      server.orchestrator.searchByImage(new Uint8Array(file.buffer), file.mimeType, {
        ...localeOptions,
        limit: fields.limit ? Number(fields.limit) : undefined,
      }),
  );
}

export async function executeTts(
  server: CommerceAIServer,
  text: string,
): Promise<Buffer> {
  if (!text.trim()) {
    throw new ValidationError("text is required");
  }

  return withRequestSpan(
    "commerce-ai.tts",
    {
      input: { textLength: text.length },
      metadata: { searchType: "tts" },
    },
    () => server.synthesizeSpeech(text),
  );
}
