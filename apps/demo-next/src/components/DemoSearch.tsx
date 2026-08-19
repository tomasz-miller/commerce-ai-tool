"use client";

import { CommerceAISearch } from "@commerce-ai-tool/react";
import { demoCatalogLocale, demoQueryLocale } from "../lib/search-config";

export function DemoSearch() {
  return (
    <CommerceAISearch
      apiBaseUrl="/api/commerce-ai"
      theme="auto"
      catalogLocale={demoCatalogLocale}
      queryLocale={demoQueryLocale}
      enableAutocomplete
      enableFacets
      enableVoice
      enableImageSearch
      enableTts
      enableCart
      onProductSelect={(product) => {
        console.log("Selected product:", product);
      }}
    />
  );
}
