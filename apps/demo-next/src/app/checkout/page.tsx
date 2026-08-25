"use client";

import { CommerceAICheckout } from "@commerce-ai-tool/react";
import {
  demoCatalogLocale,
  demoCountry,
  demoCurrency,
} from "../../lib/search-config";

export default function CheckoutPage() {
  return (
    <CommerceAICheckout
      apiBaseUrl="/api/commerce-ai"
      theme="auto"
      catalogLocale={demoCatalogLocale}
      currency={demoCurrency}
      country={demoCountry}
    />
  );
}
