export interface PaymentMethodOption {
  method: string;
  name: string;
  description?: string;
}

export interface PaymentAuthorizationRequest {
  cartId: string;
  /** Shared with order creation so retries stay idempotent. */
  orderNumber: string;
  method: string;
  amount: { centAmount: number; currencyCode: string };
  locale: string;
  country?: string;
  email?: string;
}

export interface PaymentAuthorizationResult {
  status: "authorized" | "pending" | "failed";
  /** PSP charge / intent / transaction reference. */
  interfaceId?: string;
  failureReason?: string;
  /** Opaque client payload (redirect / SCA). Never include secrets. */
  clientData?: Record<string, string>;
}

export interface PaymentProvider {
  readonly paymentInterface: string;
  listMethods(context: {
    locale: string;
    country?: string;
  }): Promise<PaymentMethodOption[]>;
  authorize(request: PaymentAuthorizationRequest): Promise<PaymentAuthorizationResult>;
}
