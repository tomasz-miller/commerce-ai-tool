import type { CommerceAIConfig } from "@commerce-ai-tool/core";
import { toWebErrorResponse } from "./handler-response.js";
import { createNextDispatcher, type NextDispatcher, type NextHandlerOptions } from "./next-dispatch.js";
import { mapRouteError } from "./route-actions.js";
import { matchRoute } from "./routes.js";

/**
 * Second argument of a Next.js route handler in a catch-all segment (`[...path]`). Since
 * Next.js 15 `params` is a Promise.
 */
export interface NextRouteContext {
  params: Promise<{ path: string[] }>;
}

export interface NextRouteHandler {
  GET(req: Request, ctx: NextRouteContext): Promise<Response>;
  POST(req: Request, ctx: NextRouteContext): Promise<Response>;
}

/**
 * One handler for every commerce-ai route, for a single catch-all file such as
 * `app/api/commerce-ai/[...path]/route.ts`. It dispatches through the route table the Express
 * router uses, so it serves the same paths with the same rate limits, body checks and errors as
 * `createNextHandlers`. Unknown paths, and known paths with the wrong method, get a 404 with
 * the standard error body (the Express router leaves both unmatched, so a host app answers 404).
 *
 * All routes share this instance's rate-limit buckets: create it once per process (a module
 * constant) and re-export `GET` and `POST`. `config` may be a function, resolved on the first
 * request, so importing the route file at build time does not need the environment variables.
 */
export function createNextRouteHandler(
  config: CommerceAIConfig | (() => CommerceAIConfig),
  options: NextHandlerOptions = {},
): NextRouteHandler {
  let dispatcher: NextDispatcher | undefined;
  const getDispatcher = () =>
    (dispatcher ??= createNextDispatcher(typeof config === "function" ? config() : config, options));

  async function handle(req: Request, ctx: NextRouteContext): Promise<Response> {
    const params = ctx?.params ? await ctx.params : undefined;
    const route = Array.isArray(params?.path) ? matchRoute(req.method, params.path) : undefined;
    if (!route) {
      return toWebErrorResponse("Not found", 404, "NOT_FOUND");
    }
    let target: NextDispatcher;
    try {
      target = getDispatcher();
    } catch (error) {
      // Config or server creation failed (for example a missing env var). Nothing is cached,
      // so the next request tries again; the client gets a masked 500 and the cause is logged.
      const mapped = mapRouteError(error, route.name, "Commerce AI is not available", undefined, req.signal);
      return toWebErrorResponse(mapped.message, mapped.status, mapped.code);
    }
    return target.dispatch(route, req);
  }

  return { GET: handle, POST: handle };
}
