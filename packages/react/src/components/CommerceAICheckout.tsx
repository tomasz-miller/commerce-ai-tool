import {
  useMemo,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { ArrowLeft, ArrowRight, Check, CreditCard, MapPin, Package } from "lucide-react";
import {
  resolveCommerceAISearchMessages,
  type CheckoutAddress,
  type CommerceAISearchMessages,
  type OrderSnapshot,
  type PaymentMethodOption,
  type PaymentSnapshot,
  type ShippingMethodSnapshot,
  type ThemeMode,
} from "@commerce-ai-tool/core";
import { useCart } from "../hooks/useCart.js";
import { ICON_STROKE } from "../icons.js";
import "../styles/commerce-ai-search.css";

export interface CommerceAICheckoutProps {
  apiBaseUrl: string;
  theme?: ThemeMode;
  catalogLocale?: string;
  currency?: string;
  country?: string;
  messages?: Partial<CommerceAISearchMessages>;
  continueShoppingHref?: string;
  orderStatusHref?: string;
  onOrderPlaced?: (order: OrderSnapshot) => void;
}

interface AddressFieldsProps {
  address: CheckoutAddress;
  messages: CommerceAISearchMessages;
  prefix: string;
  locale?: string;
  onChange: (address: CheckoutAddress) => void;
}

const CHECKOUT_COUNTRY_CODES = [
  "AT",
  "BE",
  "CH",
  "CZ",
  "DE",
  "DK",
  "ES",
  "FI",
  "FR",
  "GB",
  "IE",
  "IT",
  "NL",
  "NO",
  "PL",
  "PT",
  "SE",
  "US",
] as const;

function checkoutCountryCodes(selected: string): string[] {
  const codes = new Set<string>(CHECKOUT_COUNTRY_CODES);
  const normalized = selected.trim().toUpperCase();
  if (normalized.length === 2) {
    codes.add(normalized);
  }
  return [...codes].sort();
}

function countryLabel(code: string, locale = "en"): string {
  try {
    return new Intl.DisplayNames([locale, "en"], { type: "region" }).of(code) ?? code;
  } catch {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
    } catch {
      return code;
    }
  }
}

function createEmptyAddress(country: string): CheckoutAddress {
  return {
    firstName: "",
    lastName: "",
    streetName: "",
    postalCode: "",
    city: "",
    country,
  };
}

function AddressFields({
  address,
  messages,
  prefix,
  locale = "en",
  onChange,
}: AddressFieldsProps) {
  function update(
    field: keyof CheckoutAddress,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    onChange({ ...address, [field]: event.target.value });
  }

  return (
    <div className="cat-checkout__address-grid">
      <label className="cat-checkout__field">
        <span>{messages.firstName}</span>
        <input
          name={`${prefix}-firstName`}
          autoComplete="given-name"
          required
          value={address.firstName}
          onChange={(event) => update("firstName", event)}
        />
      </label>
      <label className="cat-checkout__field">
        <span>{messages.lastName}</span>
        <input
          name={`${prefix}-lastName`}
          autoComplete="family-name"
          required
          value={address.lastName}
          onChange={(event) => update("lastName", event)}
        />
      </label>
      <label className="cat-checkout__field cat-checkout__field--wide">
        <span>{messages.streetName}</span>
        <input
          name={`${prefix}-streetName`}
          autoComplete="address-line1"
          required
          value={address.streetName}
          onChange={(event) => update("streetName", event)}
        />
      </label>
      <label className="cat-checkout__field cat-checkout__field--wide">
        <span>{messages.additionalAddress}</span>
        <input
          name={`${prefix}-additionalStreetInfo`}
          autoComplete="address-line2"
          value={address.additionalStreetInfo ?? ""}
          onChange={(event) => update("additionalStreetInfo", event)}
        />
      </label>
      <label className="cat-checkout__field">
        <span>{messages.postalCode}</span>
        <input
          name={`${prefix}-postalCode`}
          autoComplete="postal-code"
          required
          value={address.postalCode}
          onChange={(event) => update("postalCode", event)}
        />
      </label>
      <label className="cat-checkout__field">
        <span>{messages.city}</span>
        <input
          name={`${prefix}-city`}
          autoComplete="address-level2"
          required
          value={address.city}
          onChange={(event) => update("city", event)}
        />
      </label>
      <label className="cat-checkout__field">
        <span>{messages.region}</span>
        <input
          name={`${prefix}-region`}
          autoComplete="address-level1"
          value={address.region ?? ""}
          onChange={(event) => update("region", event)}
        />
      </label>
      <label className="cat-checkout__field">
        <span>{messages.country}</span>
        <select
          name={`${prefix}-country`}
          autoComplete="country"
          required
          value={address.country}
          onChange={(event) =>
            onChange({ ...address, country: event.target.value.toUpperCase() })
          }
        >
          {checkoutCountryCodes(address.country).map((code) => (
            <option key={code} value={code}>
              {countryLabel(code, locale)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function OrderSummary({
  cart,
  messages,
}: {
  cart: NonNullable<ReturnType<typeof useCart>["cart"]>;
  messages: CommerceAISearchMessages;
}) {
  return (
    <section className="cat-checkout__bezel cat-checkout__summary">
      <div className="cat-checkout__core">
        <div className="cat-checkout__section-heading">
          <Package size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
          <h2>{messages.orderSummary}</h2>
        </div>
        <ul className="cat-checkout__items">
          {cart.lineItems.map((item) => (
            <li className="cat-checkout__item" key={item.id}>
              <span className="cat-checkout__item-copy">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="cat-checkout__item-image" />
                ) : (
                  <div className="cat-checkout__item-image cat-checkout__item-image--placeholder">
                    <Package size={16} strokeWidth={ICON_STROKE} aria-hidden="true" />
                  </div>
                )}
                <span>
                  {item.name}
                  <small>× {item.quantity}</small>
                </span>
              </span>
              <strong>{item.price?.formatted ?? "—"}</strong>
            </li>
          ))}
        </ul>
        <div className="cat-checkout__summary-total">
          <span>{messages.total}</span>
          <strong>{cart.totalPrice.formatted}</strong>
        </div>
      </div>
    </section>
  );
}

function ShippingMethodCard({
  method,
  selected,
  disabled,
  onSelect,
}: {
  method: ShippingMethodSnapshot;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`cat-checkout__shipping-card${selected ? " cat-checkout__shipping-card--selected" : ""}`}
      disabled={disabled}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="cat-checkout__shipping-copy">
        <strong>{method.name}</strong>
        {method.description ? <small>{method.description}</small> : null}
      </span>
      <span className="cat-checkout__shipping-price">
        {method.price?.formatted ?? ""}
        <span className="cat-checkout__shipping-check" aria-hidden="true">
          {selected ? <Check size={14} strokeWidth={ICON_STROKE} /> : null}
        </span>
      </span>
    </button>
  );
}

export function CommerceAICheckout({
  apiBaseUrl,
  theme = "auto",
  catalogLocale,
  currency,
  country = "DE",
  messages: messageOverrides,
  continueShoppingHref = "/",
  orderStatusHref = "/orders",
  onOrderPlaced,
}: CommerceAICheckoutProps) {
  const messages = useMemo(
    () => resolveCommerceAISearchMessages(messageOverrides),
    [messageOverrides],
  );
  const cart = useCart({ apiBaseUrl, catalogLocale, currency, country });
  const [shippingAddress, setShippingAddress] = useState(() =>
    createEmptyAddress(country),
  );
  const [billingAddress, setBillingAddress] = useState(() =>
    createEmptyAddress(country),
  );
  const [billingMatchesShipping, setBillingMatchesShipping] = useState(true);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethodSnapshot[]>([]);
  const [hasLoadedShippingMethods, setHasLoadedShippingMethods] = useState(false);
  const [selectedShippingMethodId, setSelectedShippingMethodId] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [paymentMethodsLoaded, setPaymentMethodsLoaded] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [authorizedPayment, setAuthorizedPayment] = useState<PaymentSnapshot | null>(null);
  const [order, setOrder] = useState<OrderSnapshot | null>(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleAddressSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const updated = await cart.setAddresses(
        shippingAddress,
        billingMatchesShipping ? undefined : billingAddress,
      );
      if (!updated) {
        return;
      }
      const [methods, payments] = await Promise.all([
        cart.getShippingMethods(),
        cart.getPaymentMethods(),
      ]);
      if (methods === null) {
        return;
      }
      setShippingMethods(methods);
      setHasLoadedShippingMethods(true);
      setSelectedShippingMethodId(updated.shippingMethod?.id ?? "");
      if (payments === null) {
        setPaymentMethods([]);
        setPaymentMethodsLoaded(false);
      } else {
        setPaymentMethods(payments);
        setPaymentMethodsLoaded(true);
      }
      setSelectedPaymentMethod("");
      setAuthorizedPayment(null);
    });
  }

  function selectShippingMethod(methodId: string) {
    startTransition(async () => {
      const updated = await cart.setShippingMethod(methodId);
      if (updated) {
        setSelectedShippingMethodId(methodId);
        setSelectedPaymentMethod("");
        setAuthorizedPayment(null);
      }
    });
  }

  function selectPaymentMethod(method: string) {
    if (
      authorizedPayment?.status === "authorized" &&
      authorizedPayment.method === method &&
      authorizedPayment.amount.amount === cart.cart?.totalPrice.amount &&
      authorizedPayment.amount.currency === cart.cart?.totalPrice.currency
    ) {
      return;
    }
    startTransition(async () => {
      const payment = await cart.authorizePayment(method);
      if (payment?.status === "authorized") {
        setSelectedPaymentMethod(method);
        setAuthorizedPayment(payment);
      }
    });
  }

  function placeOrder() {
    setIsPlacingOrder(true);
    startTransition(async () => {
      try {
        const placed = await cart.placeOrder();
        if (placed) {
          setOrder(placed);
          onOrderPlaced?.(placed);
        }
      } finally {
        setIsPlacingOrder(false);
      }
    });
  }

  if (order) {
    return (
      <main className="cat-root cat-checkout" data-theme={theme}>
        <section className="cat-checkout__success cat-checkout__bezel">
          <div className="cat-checkout__core">
            <span className="cat-checkout__success-icon" aria-hidden="true">
              <Check size={24} strokeWidth={ICON_STROKE} />
            </span>
            <p className="cat-checkout__eyebrow">{messages.checkout}</p>
            <h1>{messages.orderPlaced}</h1>
            <strong>{order.orderNumber ?? order.id}</strong>
            {(order.orderNumber || order.id) && orderStatusHref ? (
              <a
                className="cat-checkout__back"
                href={`${orderStatusHref}?orderNumber=${encodeURIComponent(order.orderNumber ?? order.id)}`}
              >
                {messages.viewOrderStatus}
              </a>
            ) : null}
            <a className="cat-checkout__back" href={continueShoppingHref}>
              <ArrowLeft size={15} strokeWidth={ICON_STROKE} aria-hidden="true" />
              {messages.continueShopping}
            </a>
          </div>
        </section>
      </main>
    );
  }

  if (!cart.cart) {
    return (
      <main className="cat-root cat-checkout" data-theme={theme}>
        <section className="cat-checkout__empty cat-checkout__bezel">
          <div className="cat-checkout__core">
            <Package size={24} strokeWidth={ICON_STROKE} aria-hidden="true" />
            <h1>
              {cart.isLoading || !cart.anonymousId
                ? messages.searching
                : messages.emptyCart}
            </h1>
            <a className="cat-checkout__back" href={continueShoppingHref}>
              <ArrowLeft size={15} strokeWidth={ICON_STROKE} aria-hidden="true" />
              {messages.continueShopping}
            </a>
          </div>
        </section>
      </main>
    );
  }

  const checkoutBusy = isPending || cart.isMutating || isPlacingOrder;
  const shippingReady =
    hasLoadedShippingMethods &&
    (shippingMethods.length === 0 || Boolean(selectedShippingMethodId));
  const paymentMethodsUnknown = hasLoadedShippingMethods && !paymentMethodsLoaded;
  const paymentOffered = paymentMethodsLoaded && paymentMethods.length > 0;
  const paymentRequired = paymentMethodsUnknown || paymentOffered;
  const paymentReady =
    !paymentRequired ||
    (authorizedPayment?.status === "authorized" &&
      authorizedPayment.amount.amount === cart.cart.totalPrice.amount &&
      authorizedPayment.amount.currency === cart.cart.totalPrice.currency);
  const canPlaceOrder = shippingReady && paymentReady;
  const placeOrderHint = !canPlaceOrder
    ? !hasLoadedShippingMethods
      ? messages.completeAddressToContinue
      : shippingMethods.length > 0 && !selectedShippingMethodId
        ? messages.selectDeliveryToContinue
        : paymentRequired && !paymentReady
          ? messages.selectPaymentToContinue
          : undefined
    : undefined;

  return (
    <main className="cat-root cat-checkout" data-theme={theme}>
      <header className="cat-checkout__intro">
        <p className="cat-checkout__eyebrow">{messages.checkout}</p>
        <h1>{messages.checkoutTitle}</h1>
        <ol className="cat-checkout__steps">
          <li
            className={`cat-checkout__step${hasLoadedShippingMethods ? "" : " cat-checkout__step--current"}`}
            aria-current={hasLoadedShippingMethods ? undefined : "step"}
          >
            {messages.checkoutStepAddress}
          </li>
          <li
            className={`cat-checkout__step${hasLoadedShippingMethods ? " cat-checkout__step--current" : ""}`}
            aria-current={hasLoadedShippingMethods && !paymentRequired ? "step" : undefined}
          >
            {messages.checkoutStepDelivery}
          </li>
          {paymentRequired ? (
            <li
              className={`cat-checkout__step${hasLoadedShippingMethods ? " cat-checkout__step--current" : ""}`}
              aria-current={hasLoadedShippingMethods ? "step" : undefined}
            >
              {messages.checkoutStepPayment}
            </li>
          ) : null}
        </ol>
      </header>

      {cart.error ? (
        <div className="cat-status cat-status--error" role="alert">
          {cart.error || messages.checkoutFailed}
        </div>
      ) : null}

      <div className="cat-checkout__layout">
        <OrderSummary cart={cart.cart} messages={messages} />

        <div className="cat-checkout__flow">
          <form
            className="cat-checkout__bezel"
            onSubmit={handleAddressSubmit}
          >
            <div className="cat-checkout__core">
              <div className="cat-checkout__section-heading">
                <MapPin size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
                <h2>{messages.shippingAddress}</h2>
              </div>
              <AddressFields
                address={shippingAddress}
                messages={messages}
                prefix="shipping"
                locale={catalogLocale}
                onChange={setShippingAddress}
              />
              <label className="cat-checkout__checkbox">
                <input
                  type="checkbox"
                  checked={billingMatchesShipping}
                  onChange={(event) => setBillingMatchesShipping(event.target.checked)}
                />
                <span>{messages.billingSameAsShipping}</span>
              </label>
              {!billingMatchesShipping ? (
                <div className="cat-checkout__billing">
                  <h3>{messages.billingAddress}</h3>
                  <AddressFields
                    address={billingAddress}
                    messages={messages}
                    prefix="billing"
                    locale={catalogLocale}
                    onChange={setBillingAddress}
                  />
                </div>
              ) : null}
              <button
                className="cat-checkout__secondary"
                type="submit"
                disabled={checkoutBusy}
              >
                {messages.continueToDelivery}
              </button>
            </div>
          </form>

          {hasLoadedShippingMethods ? (
          <section className="cat-checkout__bezel">
            <div className="cat-checkout__core">
              <div className="cat-checkout__section-heading">
                <Package size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
                <h2>{messages.shippingMethod}</h2>
              </div>
              {shippingMethods.length > 0 ? (
                <div
                  className="cat-checkout__shipping-methods"
                  aria-label={messages.selectShippingMethod}
                >
                  {shippingMethods.map((method) => (
                    <ShippingMethodCard
                      key={method.id}
                      method={method}
                      selected={selectedShippingMethodId === method.id}
                      disabled={checkoutBusy}
                      onSelect={() => selectShippingMethod(method.id)}
                    />
                  ))}
                </div>
              ) : (
                <p className="cat-checkout__empty-methods">
                  {messages.noShippingMethods}
                </p>
              )}
            </div>
          </section>
          ) : null}

          {shippingReady && paymentRequired ? (
          <section className="cat-checkout__bezel">
            <div className="cat-checkout__core">
              <div className="cat-checkout__section-heading">
                <CreditCard size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
                <h2>{messages.paymentMethod}</h2>
              </div>
              <div
                className="cat-checkout__shipping-methods"
                aria-label={messages.selectPaymentMethod}
              >
                {paymentMethods.map((method) => (
                  <button
                    key={method.method}
                    type="button"
                    className={`cat-checkout__shipping-card${selectedPaymentMethod === method.method ? " cat-checkout__shipping-card--selected" : ""}`}
                    disabled={checkoutBusy}
                    aria-pressed={selectedPaymentMethod === method.method}
                    onClick={() => selectPaymentMethod(method.method)}
                  >
                    <span className="cat-checkout__shipping-copy">
                      <strong>{method.name}</strong>
                      {method.description ? <small>{method.description}</small> : null}
                    </span>
                    <span className="cat-checkout__shipping-price">
                      {authorizedPayment?.status === "authorized" &&
                      authorizedPayment.method === method.method
                        ? messages.paymentAuthorized
                        : ""}
                      <span className="cat-checkout__shipping-check" aria-hidden="true">
                        {authorizedPayment?.status === "authorized" &&
                        authorizedPayment.method === method.method ? (
                          <Check size={14} strokeWidth={ICON_STROKE} />
                        ) : null}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
          ) : null}
        </div>
      </div>

      <div className="cat-checkout__place-island">
        <button
          type="button"
          className="cat-checkout-cta"
          disabled={!canPlaceOrder || checkoutBusy}
          onClick={placeOrder}
          aria-busy={checkoutBusy && canPlaceOrder ? true : undefined}
          aria-describedby={placeOrderHint ? "cat-checkout-place-hint" : undefined}
        >
          <span>{isPlacingOrder ? messages.placingOrder : messages.placeOrder}</span>
          <span className="cat-checkout-cta__icon" aria-hidden="true">
            <ArrowRight size={16} strokeWidth={ICON_STROKE} />
          </span>
        </button>
        {placeOrderHint ? (
          <p id="cat-checkout-place-hint" className="cat-checkout__place-hint">
            {placeOrderHint}
          </p>
        ) : null}
      </div>
    </main>
  );
}
