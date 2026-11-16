import type { ApiErrorBody, ApiErrorCode } from "@commerce-ai-tool/core";

export interface HandlerResponse {
  status: number;
  headers?: Record<string, string>;
  body: string | Buffer;
}

export function jsonResponse(
  data: unknown,
  status = 200,
  headers?: Record<string, string>,
): HandlerResponse {
  return {
    status,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  };
}

export function errorResponse(
  message: string,
  status: number,
  code: ApiErrorCode,
  headers?: Record<string, string>,
): HandlerResponse {
  const body: ApiErrorBody = { error: message, code };
  return jsonResponse(body, status, headers);
}

export function toWebResponse(handlerResponse: HandlerResponse): Response {
  const headers = new Headers(handlerResponse.headers);
  const body =
    typeof handlerResponse.body === "string"
      ? handlerResponse.body
      : new Uint8Array(handlerResponse.body);

  return new Response(body, { status: handlerResponse.status, headers });
}

export function toWebErrorResponse(
  message: string,
  status: number,
  code: ApiErrorCode,
  headers?: Record<string, string>,
): Response {
  const body: ApiErrorBody = { error: message, code };
  return Response.json(body, { status, headers });
}
