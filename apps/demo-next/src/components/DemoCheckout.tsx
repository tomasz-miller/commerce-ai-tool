"use client";

import Link from "next/link";
import { CommerceAICheckout } from "@commerce-ai-tool/react";
import { HydrationMarker } from "./HydrationMarker";
import {
  demoCatalogLocale,
  demoCountry,
  demoCurrency,
} from "../lib/search-config";

export function DemoCheckout() {
  return (
    <>
      <HydrationMarker />
      <CommerceAICheckout
        apiBaseUrl="/api/commerce-ai"
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
    </>
  );
}
