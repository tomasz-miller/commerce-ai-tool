"use client";

import { CommerceAISearch } from "@commerce-ai-tool/react";

export function DemoSearch() {
  return (
    <CommerceAISearch
      apiBaseUrl="/api/commerce-ai"
      theme="auto"
      locale="en"
      enableVoice
      enableImageSearch
      enableTts
      onProductSelect={(product) => {
        console.log("Selected product:", product);
      }}
    />
  );
}
