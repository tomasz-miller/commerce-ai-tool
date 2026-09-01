"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CommerceAIOrderStatus } from "@commerce-ai-tool/react";
import {
  demoCatalogLocale,
  demoCountry,
  demoCurrency,
} from "../lib/search-config";

function OrderStatusView() {
  const params = useSearchParams();
  const orderNumber = params.get("orderNumber") ?? "";

  return (
    <CommerceAIOrderStatus
      apiBaseUrl="/api/commerce-ai"
      orderNumber={orderNumber}
      theme="dark"
      catalogLocale={demoCatalogLocale}
      currency={demoCurrency}
      country={demoCountry}
    />
  );
}

export function DemoOrderStatus() {
  return (
    <Suspense fallback={null}>
      <OrderStatusView />
    </Suspense>
  );
}
