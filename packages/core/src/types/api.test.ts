import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  ApiErrorBody,
  ApiErrorCode,
  ImageSearchRequest,
  InterpretedSearchFilters,
  SearchRequestBody,
  SuggestedFacet,
  SuggestionsRequestBody,
  TextSearchRequest,
  TtsRequestBody,
  VoiceSearchRequest,
  VoiceSearchResponse,
  VoiceSearchResult,
} from "../index.js";
import type {
  ApiErrorBody as ClientApiErrorBody,
  ApiErrorCode as ClientApiErrorCode,
  ImageSearchRequest as ClientImageSearchRequest,
  SearchRequestBody as ClientSearchRequestBody,
  SuggestionsRequestBody as ClientSuggestionsRequestBody,
  TtsRequestBody as ClientTtsRequestBody,
  VoiceSearchResponse as ClientVoiceSearchResponse,
} from "../client.js";

describe("HTTP wire contract types", () => {
  it("SearchRequestBody lists every field the search route accepts", () => {
    expectTypeOf<SearchRequestBody>().toEqualTypeOf<{
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
      enableMissions?: boolean;
      widgetSessionId?: string;
      facetSelections?: Record<string, string[]>;
    }>();
  });

  it("SearchRequestBody is accepted by the orchestrator as a TextSearchRequest", () => {
    expectTypeOf<SearchRequestBody>().toExtend<TextSearchRequest>();
  });

  it("SuggestionsRequestBody lists every field the suggestions route accepts", () => {
    expectTypeOf<SuggestionsRequestBody>().toEqualTypeOf<{
      query: string;
      queryLocale?: string;
      catalogLocale?: string;
      locale?: string;
      limit?: number;
    }>();
  });

  it("VoiceSearchResponse extends the core VoiceSearchResult with the TTS fields", () => {
    expectTypeOf<VoiceSearchResponse>().toExtend<VoiceSearchResult>();
    expectTypeOf<VoiceSearchResponse["ttsPending"]>().toEqualTypeOf<boolean>();
    expectTypeOf<VoiceSearchResponse["ttsText"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<VoiceSearchResponse["audioSummary"]>().toEqualTypeOf<string | undefined>();
  });

  it("multipart request fields are strings", () => {
    expectTypeOf<ImageSearchRequest>().toEqualTypeOf<{
      queryLocale?: string;
      catalogLocale?: string;
      locale?: string;
      limit?: string;
      enableMissions?: string;
      widgetSessionId?: string;
    }>();
    expectTypeOf<VoiceSearchRequest>().toEqualTypeOf<{
      queryLocale?: string;
      catalogLocale?: string;
      locale?: string;
      limit?: string;
      enableMissions?: string;
      widgetSessionId?: string;
      enableTts?: string;
      blockingTts?: string;
    }>();
    expectTypeOf<Record<string, string>>().toExtend<ImageSearchRequest>();
  });

  it("TtsRequestBody carries the text to synthesize", () => {
    expectTypeOf<TtsRequestBody>().toEqualTypeOf<{ text: string }>();
  });

  it("ApiErrorBody pairs the message with a code from the ApiErrorCode union", () => {
    expectTypeOf<ApiErrorBody["code"]>().toEqualTypeOf<ApiErrorCode>();
    expectTypeOf<ApiErrorBody["error"]>().toEqualTypeOf<string>();
    expectTypeOf<"INVALID_CREDENTIALS">().toExtend<ApiErrorCode>();
    expectTypeOf<"NOT_FOUND">().toExtend<ApiErrorCode>();
    expectTypeOf<"NOT_A_CODE">().not.toExtend<ApiErrorCode>();
  });

  it("the browser-safe ./client entry exports the same types", () => {
    expectTypeOf<ClientSearchRequestBody>().toEqualTypeOf<SearchRequestBody>();
    expectTypeOf<ClientSuggestionsRequestBody>().toEqualTypeOf<SuggestionsRequestBody>();
    expectTypeOf<ClientVoiceSearchResponse>().toEqualTypeOf<VoiceSearchResponse>();
    expectTypeOf<ClientImageSearchRequest>().toEqualTypeOf<ImageSearchRequest>();
    expectTypeOf<ClientTtsRequestBody>().toEqualTypeOf<TtsRequestBody>();
    expectTypeOf<ClientApiErrorBody>().toEqualTypeOf<ApiErrorBody>();
    expectTypeOf<ClientApiErrorCode>().toEqualTypeOf<ApiErrorCode>();
    expect(true).toBe(true);
  });
});
