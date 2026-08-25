"use client";

import { CommerceAISearch } from "@commerce-ai-tool/react";
import { useRouter } from "next/navigation";
import {
  demoCatalogLocale,
  demoCountry,
  demoCurrency,
  demoQueryLocale,
} from "../lib/search-config";

export function DemoSearch() {
  const router = useRouter();

  return (
    <CommerceAISearch
      apiBaseUrl="/api/commerce-ai"
      theme="auto"
      catalogLocale={demoCatalogLocale}
      queryLocale={demoQueryLocale}
      currency={demoCurrency}
      country={demoCountry}
      enableAutocomplete
      enableFacets
      enableVoice
      enableImageSearch
      enableTts
      enableCart
      onCheckout={() => router.push("/checkout")}
      onProductSelect={(product) => {
        console.log("Selected product:", product);
      }}
    />
  );
}
