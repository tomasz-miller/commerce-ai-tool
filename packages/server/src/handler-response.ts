export interface HandlerResponse {
  status: number;
  headers?: Record<string, string>;
  body: string | Buffer;
}

export function jsonResponse(data: unknown, status = 200): HandlerResponse {
  return {
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

export function errorResponse(message: string, status = 500): HandlerResponse {
  return jsonResponse({ error: message }, status);
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
  status = 500,
): Response {
  return Response.json({ error: message }, { status });
}
