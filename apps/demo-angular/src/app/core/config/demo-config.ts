import { InjectionToken } from "@angular/core";
import type { ThemeMode } from "@commerce-ai-tool/core/client";

export interface DemoConfig {
  apiBaseUrl: string;
  theme: ThemeMode;
  catalogLocale?: string;
  queryLocale?: string;
  currency: string;
  country: string;
}

export const DEMO_CONFIG = new InjectionToken<DemoConfig>("DEMO_CONFIG");

export function defaultDemoConfig(): DemoConfig {
  return {
    apiBaseUrl: "/api/commerce-ai",
    theme: "dark",
    currency: "EUR",
    country: "DE",
  };
}
