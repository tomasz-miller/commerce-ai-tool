import { getCommerceAIHandlers } from "@/lib/commerce-ai-handlers";

export async function GET() {
  return getCommerceAIHandlers().facetSchema();
}
