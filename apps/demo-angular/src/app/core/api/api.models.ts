import type {
  CartSnapshot,
  CustomerSnapshot,
  OrderSnapshot,
  PaymentMethodOption,
  PaymentSnapshot,
  ShippingMethodSnapshot,
} from "@commerce-ai-tool/core/client";

export interface CartApiEnvelope {
  cart?: CartSnapshot | null;
  customer?: CustomerSnapshot | null;
  sessionToken?: string;
  shippingMethods?: ShippingMethodSnapshot[];
  paymentMethods?: PaymentMethodOption[];
  payment?: PaymentSnapshot;
  order?: OrderSnapshot;
  orders?: OrderSnapshot[];
  error?: string;
}

export interface CheckoutServiceOptions {
  apiBaseUrl: string;
  currency?: string;
  country?: string;
  catalogLocale?: string;
}
