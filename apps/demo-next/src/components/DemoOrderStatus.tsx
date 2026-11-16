"use client";

import { Suspense } from "react";
import Link from "next/link";
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
      theme="light"
      catalogLocale={demoCatalogLocale}
      currency={demoCurrency}
      country={demoCountry}
      headingLevel={1}
      renderLink={({ href, className, children }) => (
        <Link href={href} className={className}>
          {children}
        </Link>
      )}
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
