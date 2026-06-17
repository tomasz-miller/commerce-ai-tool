import type { CommerceAIServer } from "./server.js";
import { parseMultipart, readJsonBody } from "./utils/multipart.js";

export interface HandlerResponse {
  status: number;
  headers?: Record<string, string>;
  body: string | Buffer;
}

function jsonResponse(data: unknown, status = 200): HandlerResponse {
  return {
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

function errorResponse(message: string, status = 500): HandlerResponse {
  return jsonResponse({ error: message }, status);
}

export function createHandlers(server: CommerceAIServer) {
  return {
    async health(): Promise<HandlerResponse> {
      return jsonResponse({ status: "ok" });
    },

    async search(req: import("node:http").IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<{ query: string; locale?: string; limit?: number }>(req);

        if (!body.query?.trim()) {
          return errorResponse("query is required", 400);
        }

        const result = await server.orchestrator.searchByText({
          query: body.query,
          locale: body.locale,
          limit: body.limit,
        });

        return jsonResponse(result);
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : "Search failed");
      }
    },

    async searchVoice(req: import("node:http").IncomingMessage): Promise<HandlerResponse> {
      try {
        const { fields, file } = await parseMultipart(req);

        if (!file) {
          return errorResponse("audio file is required", 400);
        }

        const result = await server.orchestrator.searchByVoice(
          new Uint8Array(file.buffer),
          file.mimeType,
          {
          locale: fields.locale,
          limit: fields.limit ? Number(fields.limit) : undefined,
          enableTts: fields.enableTts !== "false",
        });

        let audioSummary: string | undefined;
        if (result.ttsText && server) {
          try {
            const audio = await server.synthesizeSpeech(result.ttsText);
            audioSummary = audio.toString("base64");
          } catch {
            // TTS is optional; continue without audio summary
          }
        }

        return jsonResponse({
          transcript: result.transcript,
          enhancedQuery: result.enhancedQuery,
          products: result.products,
          meta: result.meta,
          audioSummary,
        });
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : "Voice search failed");
      }
    },

    async searchImage(req: import("node:http").IncomingMessage): Promise<HandlerResponse> {
      try {
        const { fields, file } = await parseMultipart(req);

        if (!file) {
          return errorResponse("image file is required", 400);
        }

        const result = await server.orchestrator.searchByImage(
          new Uint8Array(file.buffer),
          file.mimeType,
          {
          locale: fields.locale,
          limit: fields.limit ? Number(fields.limit) : undefined,
        });

        return jsonResponse(result);
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : "Image search failed");
      }
    },

    async tts(req: import("node:http").IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<{ text: string }>(req);

        if (!body.text?.trim()) {
          return errorResponse("text is required", 400);
        }

        const audio = await server.synthesizeSpeech(body.text);

        return {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
          body: audio,
        };
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : "TTS failed");
      }
    },
  };
}

export type CommerceAIHandlers = ReturnType<typeof createHandlers>;
