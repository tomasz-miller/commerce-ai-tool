import { logSearchTrace, SearchTimeoutError } from "@commerce-ai-tool/core";
import type { VoiceSearchResult } from "@commerce-ai-tool/core";
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

  const localeOptions = parseSearchLocaleOptions(body);
  logSearchTrace("handler", {
    type: "text",
    query: body.query,
    queryLocale: localeOptions.queryLocale,
    catalogLocale: localeOptions.catalogLocale,
  });

  return server.orchestrator.searchByText({
    query: body.query,
    ...localeOptions,
    limit: body.limit,
  });
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

  return server.orchestrator.searchByImage(
    new Uint8Array(file.buffer),
    file.mimeType,
    {
      ...localeOptions,
      limit: fields.limit ? Number(fields.limit) : undefined,
    },
  );
}

export async function executeTts(
  server: CommerceAIServer,
  text: string,
): Promise<Buffer> {
  if (!text.trim()) {
    throw new ValidationError("text is required");
  }

  return server.synthesizeSpeech(text);
}
