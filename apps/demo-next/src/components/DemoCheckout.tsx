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
      theme="dark"
      catalogLocale={demoCatalogLocale}
      currency={demoCurrency}
      country={demoCountry}
    />
  );
}
