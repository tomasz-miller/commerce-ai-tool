import type { CommerceAIConfig } from "@commerce-ai-tool/core";
import { createHandlers } from "./handlers.js";
import { toWebErrorResponse, toWebResponse } from "./handler-response.js";
import { createCommerceAIServer } from "./server.js";
import {
  executeSearch,
  executeSearchImage,
  executeSearchVoice,
  executeTts,
  mapRouteError,
} from "./route-actions.js";
import { parseMultipartRequest } from "./utils/multipart.js";

export interface NextHandlers {
  health: () => Promise<Response>;
  search: (req: Request) => Promise<Response>;
  searchVoice: (req: Request) => Promise<Response>;
  searchImage: (req: Request) => Promise<Response>;
  tts: (req: Request) => Promise<Response>;
}

export function createNextHandlers(config: CommerceAIConfig): NextHandlers {
  const server = createCommerceAIServer({ config });
  const handlers = createHandlers(server);

  return {
    health: async () => toWebResponse(await handlers.health()),

    search: async (req: Request) => {
      try {
        const body = (await req.json()) as {
          query: string;
          queryLocale?: string;
          catalogLocale?: string;
          locale?: string;
          limit?: number;
        };

        const result = await executeSearch(server, body);
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(error, "search", "Search failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    searchVoice: async (req: Request) => {
      let fields: Record<string, string> = {};
      let file: Awaited<ReturnType<typeof parseMultipartRequest>>["file"];

      try {
        const parsed = await parseMultipartRequest(req);
        fields = parsed.fields;
        file = parsed.file;

        const result = await executeSearchVoice(server, fields, file);
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(error, "searchVoice", "Voice search failed", {
          queryLocale: fields.queryLocale ?? fields.locale,
          catalogLocale: fields.catalogLocale,
          mimeType: file?.mimeType,
          size: file?.buffer.length,
        });
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    searchImage: async (req: Request) => {
      try {
        const { fields, file } = await parseMultipartRequest(req);
        const result = await executeSearchImage(server, fields, file);
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(error, "searchImage", "Image search failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    tts: async (req: Request) => {
      try {
        const body = (await req.json()) as { text: string };
        const audio = await executeTts(server, body.text);

        return new Response(audio, {
          headers: { "Content-Type": "audio/mpeg" },
        });
      } catch (error) {
        const mapped = mapRouteError(error, "tts", "TTS failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },
  };
}
