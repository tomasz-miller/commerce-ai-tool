import type { CommerceAIConfig } from "@commerce-ai-tool/core";
import { createHandlers } from "./handlers.js";
import { createCommerceAIServer } from "./server.js";
import { logServerError, logServerWarning } from "./utils/log-error.js";
import { parseMultipartRequest, type ParsedMultipart } from "./utils/multipart.js";

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
    health: async () => {
      const response = await handlers.health();
      return toWebResponse(response);
    },

    search: async (req: Request) => {
      try {
        const body = (await req.json()) as { query: string; locale?: string; limit?: number };

        if (!body.query?.trim()) {
          return Response.json({ error: "query is required" }, { status: 400 });
        }

        const result = await server.orchestrator.searchByText({
          query: body.query,
          locale: body.locale,
          limit: body.limit,
        });

        return Response.json(result);
      } catch (error) {
        logServerError("search", error);
        return errorJson(error, "Search failed");
      }
    },

    searchVoice: async (req: Request) => {
      let fields: Record<string, string> = {};
      let file: ParsedMultipart["file"];

      try {
        const parsed = await parseMultipartRequest(req);
        fields = parsed.fields;
        file = parsed.file;

        if (!file) {
          return Response.json({ error: "audio file is required" }, { status: 400 });
        }

        const result = await server.orchestrator.searchByVoice(
          new Uint8Array(file.buffer),
          file.mimeType,
          {
            locale: fields.locale,
            limit: fields.limit ? Number(fields.limit) : undefined,
            enableTts: fields.enableTts !== "false",
          },
        );

        let audioSummary: string | undefined;
        if (result.ttsText) {
          try {
            const audio = await server.synthesizeSpeech(result.ttsText);
            audioSummary = audio.toString("base64");
          } catch (error) {
            logServerWarning("searchVoice", "TTS summary skipped", {
              reason: error instanceof Error ? error.message : "unknown",
            });
          }
        }

        return Response.json({
          transcript: result.transcript,
          enhancedQuery: result.enhancedQuery,
          products: result.products,
          meta: result.meta,
          audioSummary,
        });
      } catch (error) {
        logServerError("searchVoice", error, {
          locale: fields.locale,
          mimeType: file?.mimeType,
          size: file?.buffer.length,
        });
        return errorJson(error, "Voice search failed");
      }
    },

    searchImage: async (req: Request) => {
      try {
        const { fields, file } = await parseMultipartRequest(req);

        if (!file) {
          return Response.json({ error: "image file is required" }, { status: 400 });
        }

        const result = await server.orchestrator.searchByImage(
          new Uint8Array(file.buffer),
          file.mimeType,
          {
            locale: fields.locale,
            limit: fields.limit ? Number(fields.limit) : undefined,
          },
        );

        return Response.json(result);
      } catch (error) {
        logServerError("searchImage", error);
        return errorJson(error, "Image search failed");
      }
    },

    tts: async (req: Request) => {
      try {
        const body = (await req.json()) as { text: string };

        if (!body.text?.trim()) {
          return Response.json({ error: "text is required" }, { status: 400 });
        }

        const audio = await server.synthesizeSpeech(body.text);

        return new Response(audio, {
          headers: { "Content-Type": "audio/mpeg" },
        });
      } catch (error) {
        logServerError("tts", error);
        return errorJson(error, "TTS failed");
      }
    },
  };
}

function errorJson(error: unknown, fallback: string): Response {
  return Response.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}

function toWebResponse(handlerResponse: {
  status: number;
  headers?: Record<string, string>;
  body: string | Buffer;
}): Response {
  const headers = new Headers(handlerResponse.headers);
  const body =
    typeof handlerResponse.body === "string"
      ? handlerResponse.body
      : new Uint8Array(handlerResponse.body);

  return new Response(body, { status: handlerResponse.status, headers });
}
