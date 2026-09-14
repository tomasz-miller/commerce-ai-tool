import { Injectable, computed, signal } from "@angular/core";
import type {
  CheckoutAddress,
  OrderSnapshot,
  PaymentMethodOption,
  PaymentSnapshot,
  ShippingMethodSnapshot,
} from "@commerce-ai-tool/core/client";
import { CheckoutApiService } from "../api/checkout-api.service.js";

export type CheckoutStep = "address" | "delivery" | "payment" | "done";

/**
 * Orchestrates the host checkout wizard. Components bind to the signals and
 * call the transition methods; all BFF traffic stays in `CheckoutApiService`.
 */
@Injectable()
export class CheckoutFacade {
  readonly shippingMethods = signal<ShippingMethodSnapshot[]>([]);
  readonly paymentMethods = signal<PaymentMethodOption[]>([]);
  readonly selectedShippingMethodId = signal("");
  readonly selectedPaymentMethod = signal("");
  readonly authorizedPayment = signal<PaymentSnapshot | null>(null);
  readonly order = signal<OrderSnapshot | null>(null);
  readonly addressesSaved = signal(false);
  readonly isBusy = signal(false);

  readonly shippingReady = computed(
    () => this.addressesSaved() && Boolean(this.selectedShippingMethodId()),
  );

  readonly paymentRequired = computed(
    () => this.addressesSaved() && this.paymentMethods().length > 0,
  );

  readonly paymentReady = computed(() => {
    if (!this.paymentRequired()) {
      return true;
    }
    const payment = this.authorizedPayment();
    const total = this.api.cart()?.totalPrice;
    return (
      payment?.status === "authorized" &&
      Boolean(total) &&
      payment.amount.amount === total?.amount &&
      payment.amount.currency === total?.currency
    );
  });

  readonly canPlaceOrder = computed(() => this.shippingReady() && this.paymentReady());

  constructor(private readonly api: CheckoutApiService) {}

  async saveAddresses(
    shippingAddress: CheckoutAddress,
    billingAddress?: CheckoutAddress,
  ): Promise<boolean> {
    this.isBusy.set(true);
    try {
      const updated = await this.api.setAddresses(shippingAddress, billingAddress);
      if (!updated) {
        return false;
      }
      const [methods, payments] = await Promise.all([
        this.api.getShippingMethods(),
        this.api.getPaymentMethods(),
      ]);
      if (methods === null || payments === null) {
        return false;
      }
      this.shippingMethods.set(methods);
      this.paymentMethods.set(payments);
      this.selectedShippingMethodId.set(updated.shippingMethod?.id ?? "");
      this.selectedPaymentMethod.set("");
      this.authorizedPayment.set(null);
      this.addressesSaved.set(true);
      return true;
    } finally {
      this.isBusy.set(false);
    }
  }

  async selectShippingMethod(shippingMethodId: string): Promise<boolean> {
    this.isBusy.set(true);
    try {
      const updated = await this.api.setShippingMethod(shippingMethodId);
      if (!updated) {
        return false;
      }
      this.selectedShippingMethodId.set(shippingMethodId);
      this.selectedPaymentMethod.set("");
      this.authorizedPayment.set(null);
      return true;
    } finally {
      this.isBusy.set(false);
    }
  }

  async selectPaymentMethod(method: string): Promise<boolean> {
    const current = this.authorizedPayment();
    const total = this.api.cart()?.totalPrice;
    if (
      current?.status === "authorized" &&
      current.method === method &&
      total &&
      current.amount.amount === total.amount &&
      current.amount.currency === total.currency
    ) {
      return true;
    }
    this.isBusy.set(true);
    try {
      const payment = await this.api.authorizePayment(method);
      if (payment?.status === "authorized") {
        this.selectedPaymentMethod.set(method);
        this.authorizedPayment.set(payment);
        return true;
      }
      return false;
    } finally {
      this.isBusy.set(false);
    }
  }

  async placeOrder(): Promise<OrderSnapshot | null> {
    this.isBusy.set(true);
    try {
      const placed = await this.api.placeOrder();
      if (placed) {
        this.order.set(placed);
      }
      return placed;
    } finally {
      this.isBusy.set(false);
    }
  }
}
