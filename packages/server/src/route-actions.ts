import {
  AIOutputTruncatedError,
  AIRateLimitedError,
  AIUpstreamError,
  CartAccessDeniedError,
  CartNotFoundError,
  CheckoutIncompleteError,
  CountryNotAllowedError,
  CurrencyMismatchError,
  InvalidCredentialsError,
  OrderNotFoundError,
  PaymentDeclinedError,
  PaymentNotConfiguredError,
  SearchTimeoutError,
  MissingPriceError,
  ProductSearchUnavailableError,
  UnsupportedAudioTypeError,
  VoiceNotConfiguredError,
} from "@commerce-ai-tool/core";
import { logSearchTrace, withTraceSession } from "@commerce-ai-tool/core/internal";
import { InvalidCartSessionError } from "./cart-session.js";
import { HttpError, ValidationError } from "./errors.js";
import {
  assertMaxChars,
  clampSearchLimit,
  MAX_QUERY_CHARS,
  MAX_TTS_CHARS,
  parseFacetSelections,
  parseSearchSort,
  parseSearchTerms,
  parseSuggestedFacets,
  parseWidgetSessionId,
} from "./input-limits.js";
import { TooManyRequestsError } from "./rate-limit.js";
import type {
  ApiErrorCode,
  ImageSearchRequest,
  ImageSearchResult,
  ResolvedFacetSchema,
  SearchRequestBody,
  SearchResult,
  SuggestionsRequestBody,
  SuggestionsResult,
  VoiceSearchRequest,
  VoiceSearchResponse,
} from "@commerce-ai-tool/core";
import {
  clampSuggestionsLimit,
  normalizeSuggestionsPrefix,
} from "@commerce-ai-tool/core/internal";
import {
  redactBinaryInput,
  withOptionalRequestSpan,
  withRequestSpan,
  shouldTraceSuggestions,
  scheduleFlush,
  isLangfuseEnabled,
  type FlushDefer,
} from "./observability/langfuse.js";
import type { CommerceAIServer } from "./server.js";
import { logServerError, logServerWarning } from "./utils/log-error.js";
import { localePolicy, parseSearchLocaleOptions } from "./utils/locale.js";
import type { ParsedMultipart } from "./utils/multipart.js";

/** Orchestrator default when neither the request nor `config.defaults.limit` sets one. */
const FALLBACK_SEARCH_LIMIT = 20;

/** Absent → orchestrator default; present → clamped to 1..MAX_SEARCH_LIMIT. */
function optionalSearchLimit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return clampSearchLimit(value, FALLBACK_SEARCH_LIMIT);
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

/** A 503 means a misconfigured or unavailable backend the operator must see; 4xx errors are not logged. */
function warnUpstreamUnavailable(context: string): void {
  logServerWarning(context, "UPSTREAM_UNAVAILABLE (503)");
}

/**
 * `requestSignal` is the host request's abort signal. Once it has aborted, the client is gone:
 * whatever the step rejected with (Next 16 uses a `ResponseAborted` reason, Express an
 * AbortError, or the error of a step that was cut short), the request maps to 499 and is not
 * logged. 499 follows the "client closed request" convention; nobody reads the body.
 */
export function mapRouteError(
  error: unknown,
  context: string,
  fallback: string,
  extra?: Record<string, unknown>,
  requestSignal?: AbortSignal,
): { message: string; status: number; code: ApiErrorCode } {
  if (requestSignal?.aborted || isAbortError(error)) {
    return { message: "Request aborted", status: 499, code: "INTERNAL" };
  }

  if (error instanceof HttpError) {
    if (error.status === 503 && error.code === "UPSTREAM_UNAVAILABLE") {
      warnUpstreamUnavailable(context);
    }
    return { message: error.message, status: error.status, code: error.code };
  }

  // Fixed messages: the core errors carry the client's MIME type or config switch names.
  if (error instanceof UnsupportedAudioTypeError) {
    return { message: "Unsupported audio type", status: 415, code: "UNSUPPORTED_MEDIA_TYPE" };
  }

  if (error instanceof VoiceNotConfiguredError) {
    warnUpstreamUnavailable(context);
    return {
      message: "Voice service is not configured",
      status: 503,
      code: "UPSTREAM_UNAVAILABLE",
    };
  }

  // Fixed message: the core text names the project and the Merchant Center setting. The operator
  // gets it in the log, where the fix is actionable.
  if (error instanceof ProductSearchUnavailableError) {
    logServerWarning(context, error.message);
    return {
      message: "Product search is not available",
      status: 503,
      code: "UPSTREAM_UNAVAILABLE",
    };
  }

  if (error instanceof SearchTimeoutError) {
    return { message: error.message, status: 504, code: "TIMEOUT" };
  }

  // Fixed messages: the provider response body never reaches the client.
  if (error instanceof AIRateLimitedError) {
    return {
      message: "The AI service is busy, try again shortly",
      status: 429,
      code: "RATE_LIMITED",
    };
  }

  if (error instanceof AIUpstreamError) {
    warnUpstreamUnavailable(context);
    return { message: "The AI service is unavailable", status: 503, code: "UPSTREAM_UNAVAILABLE" };
  }

  if (error instanceof AIOutputTruncatedError) {
    warnUpstreamUnavailable(context);
    return {
      message: "The AI service returned an incomplete answer",
      status: 503,
      code: "UPSTREAM_UNAVAILABLE",
    };
  }

  if (error instanceof CountryNotAllowedError) {
    return { message: "Shipping country is not allowed", status: 400, code: "VALIDATION" };
  }

  if (error instanceof CurrencyMismatchError) {
    return {
      message: "The cart currency does not match the shipping country",
      status: 400,
      code: "VALIDATION",
    };
  }

  if (error instanceof CheckoutIncompleteError) {
    return { message: error.message, status: 400, code: "CHECKOUT_INCOMPLETE" };
  }

  // Fixed messages: the core text names the product, currency and country, and a PSP decline
  // reason is provider text. The original is logged under CAT_DEBUG only.
  if (error instanceof MissingPriceError) {
    logServerWarning(context, "MISSING_PRICE (400)", { reason: error.message });
    return {
      message: "No matching price for this cart currency and country",
      status: 400,
      code: "MISSING_PRICE",
    };
  }

  if (error instanceof PaymentDeclinedError) {
    logServerWarning(context, "PAYMENT_DECLINED (402)", { reason: error.message });
    return { message: "Payment was declined", status: 402, code: "PAYMENT_DECLINED" };
  }

  if (error instanceof PaymentNotConfiguredError) {
    return { message: error.message, status: 400, code: "PAYMENT_NOT_CONFIGURED" };
  }

  if (error instanceof CartNotFoundError) {
    return { message: error.message, status: 404, code: "CART_NOT_FOUND" };
  }

  if (error instanceof OrderNotFoundError) {
    return { message: error.message, status: 404, code: "ORDER_NOT_FOUND" };
  }

  if (error instanceof CartAccessDeniedError) {
    return { message: error.message, status: 403, code: "CART_ACCESS_DENIED" };
  }

  if (error instanceof InvalidCredentialsError) {
    return { message: error.message, status: 401, code: "INVALID_CREDENTIALS" };
  }

  if (error instanceof InvalidCartSessionError) {
    return { message: error.message, status: 401, code: "SESSION_INVALID" };
  }

  if (error instanceof TooManyRequestsError) {
    return { message: error.message, status: 429, code: "RATE_LIMITED" };
  }

  // Unknown errors may carry provider, SDK or infrastructure details: log them server-side
  // and return only the generic fallback to the client.
  logServerError(context, error, extra, "INTERNAL");
  return { message: fallback, status: 500, code: "INTERNAL" };
}

/** Fallback when no request signal is passed: an AbortError reason that reached the mapping. */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * `signal` is the host request's abort signal (Next `req.signal`, or the Express adapter's
 * response-close signal). It cancels the remaining pipeline steps and in-flight AI calls.
 */
export async function executeSearch(
  server: CommerceAIServer,
  body: SearchRequestBody,
  defer?: FlushDefer,
  signal?: AbortSignal,
): Promise<SearchResult> {
  if (typeof body.query !== "string" || !body.query.trim()) {
    throw new ValidationError("query is required");
  }
  assertMaxChars(body.query, MAX_QUERY_CHARS, "query");
  if (body.refineQuery !== undefined && body.refineQuery !== null && typeof body.refineQuery !== "string") {
    throw new ValidationError("refineQuery must be a string");
  }
  assertMaxChars(body.refineQuery, MAX_QUERY_CHARS, "refineQuery");
  const searchTerms = parseSearchTerms(body.searchTerms);
  if (body.refineQuery && (!searchTerms || searchTerms.length === 0)) {
    throw new ValidationError("searchTerms are required for a refinement");
  }
  const sort = parseSearchSort(body.sort);
  const suggestedFacets = parseSuggestedFacets(body.suggestedFacets);
  const facetSelections = parseFacetSelections(body.facetSelections);

  const localeOptions = parseSearchLocaleOptions(body, localePolicy(server));
  logSearchTrace("handler", {
    type: "text",
    query: body.query,
    queryLocale: localeOptions.queryLocale,
    catalogLocale: localeOptions.catalogLocale,
  });

  // The `ai.interpret*` generation already carries the query text, so the request span records
  // only lengths: the text would otherwise be exported twice.
  return withTraceSession(parseWidgetSessionId(body.widgetSessionId), () =>
    withRequestSpan(
      "commerce-ai.search",
      {
        input: {
          queryLength: body.query.length,
          ...(body.refineQuery ? { refineQueryLength: body.refineQuery.length } : {}),
        },
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
          limit: optionalSearchLimit(body.limit),
          filters: body.filters,
          searchTerms,
          sort,
          refineQuery: body.refineQuery,
          includeFacets: body.includeFacets,
          suggestedFacets,
          facetSelections,
          enableMissions: body.enableMissions,
          signal,
        }),
      defer,
    ),
  );
}

export async function executeFacetSchema(
  server: CommerceAIServer,
  options?: Pick<SearchRequestBody, "queryLocale" | "catalogLocale" | "locale">,
): Promise<ResolvedFacetSchema> {
  return server.orchestrator.getFacetSchema(
    options ? parseSearchLocaleOptions(options, localePolicy(server)) : undefined,
  );
}

export async function executeSearchSuggestions(
  server: CommerceAIServer,
  body: SuggestionsRequestBody,
  defer?: FlushDefer,
  signal?: AbortSignal,
): Promise<SuggestionsResult> {
  assertMaxChars(body.query, MAX_QUERY_CHARS, "query");
  const normalizedQuery = normalizeSuggestionsPrefix(typeof body.query === "string" ? body.query : "");
  if (!normalizedQuery) {
    throw new ValidationError("query must be at least 2 characters");
  }

  const localeOptions = parseSearchLocaleOptions(body, localePolicy(server));
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
    async () => {
      const result = await server.orchestrator.suggestByText({
        query: normalizedQuery,
        ...localeOptions,
        limit: clampSuggestionsLimit(body.limit),
        signal,
      });

      // AI fallback emits generations even when the Suggest request span is skipped;
      // schedule a flush (never awaited) so serverless isolates do not drop them.
      if (!shouldTraceSuggestions() && result.aiFallbackUsed && isLangfuseEnabled()) {
        scheduleFlush(defer);
      }

      return result;
    },
    defer,
  );
}

export async function executeSearchVoice(
  server: CommerceAIServer,
  fields: VoiceSearchRequest,
  file: ParsedMultipart["file"],
  defer?: FlushDefer,
  signal?: AbortSignal,
): Promise<VoiceSearchResponse> {
  if (!file) {
    throw new ValidationError("audio file is required");
  }

  const localeOptions = parseSearchLocaleOptions(fields, localePolicy(server));
  logSearchTrace("handler", {
    type: "voice",
    mimeType: file.mimeType,
    queryLocale: localeOptions.queryLocale,
    catalogLocale: localeOptions.catalogLocale,
  });

  return withTraceSession(parseWidgetSessionId(fields.widgetSessionId), () =>
    withRequestSpan(
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
            limit: optionalSearchLimit(fields.limit),
            enableTts: fields.enableTts !== "false",
            enableMissions: parseOptionalBoolean(fields.enableMissions),
            signal,
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
          mission: result.mission,
          ttsText: result.ttsText,
          audioSummary,
          ttsPending: Boolean(result.ttsText && !audioSummary),
        };
      },
      defer,
    ),
  );
}

export async function executeSearchImage(
  server: CommerceAIServer,
  fields: ImageSearchRequest,
  file: ParsedMultipart["file"],
  defer?: FlushDefer,
  signal?: AbortSignal,
): Promise<ImageSearchResult> {
  if (!file) {
    throw new ValidationError("image file is required");
  }

  const localeOptions = parseSearchLocaleOptions(fields, localePolicy(server));
  logSearchTrace("handler", {
    type: "image",
    mimeType: file.mimeType,
    queryLocale: localeOptions.queryLocale,
    catalogLocale: localeOptions.catalogLocale,
  });

  return withTraceSession(parseWidgetSessionId(fields.widgetSessionId), () =>
    withRequestSpan(
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
          limit: optionalSearchLimit(fields.limit),
          enableMissions: parseOptionalBoolean(fields.enableMissions),
          signal,
        }),
      defer,
    ),
  );
}

export async function executeTts(
  server: CommerceAIServer,
  text: string,
  defer?: FlushDefer,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (typeof text !== "string" || !text.trim()) {
    throw new ValidationError("text is required");
  }
  assertMaxChars(text, MAX_TTS_CHARS, "text");

  return withRequestSpan(
    "commerce-ai.tts",
    {
      input: { textLength: text.length },
      metadata: { searchType: "tts" },
    },
    () => server.synthesizeSpeech(text, signal),
    defer,
  );
}
