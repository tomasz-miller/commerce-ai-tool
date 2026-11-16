import { getCommerceAIHandlers } from "@/lib/commerce-ai-handlers";

// Optional example of a per-route file. The catch-all in `[...path]/route.ts` already serves
// every route, including `/health`; a file like this one takes precedence for its own path.
export async function GET() {
  return getCommerceAIHandlers().health();
}
