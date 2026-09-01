import { getCommerceAIHandlers } from "@/lib/commerce-ai-handlers";

export async function GET(req: Request) {
  return getCommerceAIHandlers().getShippingMethods(req);
}
