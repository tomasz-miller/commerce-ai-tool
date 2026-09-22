"use client";

import { CommerceAICheckout } from "@commerce-ai-tool/react";
import {
  demoCatalogLocale,
  demoCountry,
  demoCurrency,
} from "../lib/search-config";

export function DemoCheckout() {
  return (
    <CommerceAICheckout
      apiBaseUrl="/api/commerce-ai"
      theme="light"
      catalogLocale={demoCatalogLocale}
      currency={demoCurrency}
      country={demoCountry}
    />
  );
}
