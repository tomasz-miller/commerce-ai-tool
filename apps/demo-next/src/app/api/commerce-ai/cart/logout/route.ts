import { getCommerceAIHandlers } from "@/lib/commerce-ai-handlers";

export async function POST() {
  return getCommerceAIHandlers().logout();
}
