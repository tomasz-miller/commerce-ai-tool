import type { IncomingMessage } from "node:http";
import type { CommerceAIServer } from "./server.js";
import { errorResponse, jsonResponse, type HandlerResponse } from "./handler-response.js";
import {
  executeSearch,
  executeSearchImage,
  executeSearchVoice,
  executeTts,
  mapRouteError,
} from "./route-actions.js";
import { parseMultipart, readJsonBody } from "./utils/multipart.js";

export type { HandlerResponse } from "./handler-response.js";

export function createHandlers(server: CommerceAIServer) {
  return {
    async health(): Promise<HandlerResponse> {
      return jsonResponse({ status: "ok" });
    },

    async search(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<{
          query: string;
          queryLocale?: string;
          catalogLocale?: string;
          locale?: string;
          limit?: number;
        }>(req);

        const result = await executeSearch(server, body);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "search", "Search failed");
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async searchVoice(req: IncomingMessage): Promise<HandlerResponse> {
      let fields: Record<string, string> = {};
      let file: Awaited<ReturnType<typeof parseMultipart>>["file"];

      try {
        const parsed = await parseMultipart(req);
        fields = parsed.fields;
        file = parsed.file;

        const result = await executeSearchVoice(server, fields, file);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "searchVoice", "Voice search failed", {
          queryLocale: fields.queryLocale ?? fields.locale,
          catalogLocale: fields.catalogLocale,
          mimeType: file?.mimeType,
          size: file?.buffer.length,
        });
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async searchImage(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const { fields, file } = await parseMultipart(req);
        const result = await executeSearchImage(server, fields, file);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "searchImage", "Image search failed");
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async tts(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<{ text: string }>(req);
        const audio = await executeTts(server, body.text);

        return {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
          body: audio,
        };
      } catch (error) {
        const mapped = mapRouteError(error, "tts", "TTS failed");
        return errorResponse(mapped.message, mapped.status);
      }
    },
  };
}

export type CommerceAIHandlers = ReturnType<typeof createHandlers>;
