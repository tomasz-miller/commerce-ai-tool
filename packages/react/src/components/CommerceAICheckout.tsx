import {
  useMemo,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { ArrowLeft, ArrowRight, Check, MapPin, Package } from "lucide-react";
import {
  resolveCommerceAISearchMessages,
  type CheckoutAddress,
  type CommerceAISearchMessages,
  type OrderSnapshot,
  type ShippingMethodSnapshot,
  type ThemeMode,
} from "@commerce-ai-tool/core";
import { useCart } from "../hooks/useCart.js";
import "../styles/commerce-ai-search.css";

export interface CommerceAICheckoutProps {
  apiBaseUrl: string;
  theme?: ThemeMode;
  catalogLocale?: string;
  currency?: string;
  country?: string;
  messages?: Partial<CommerceAISearchMessages>;
  continueShoppingHref?: string;
  onOrderPlaced?: (order: OrderSnapshot) => void;
}

interface AddressFieldsProps {
  address: CheckoutAddress;
  messages: CommerceAISearchMessages;
  prefix: string;
  onChange: (address: CheckoutAddress) => void;
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
        <input
          name={`${prefix}-country`}
          autoComplete="country"
          required
          minLength={2}
          maxLength={2}
          value={address.country}
          onChange={(event) => update("country", event)}
        />
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
          <Package size={18} strokeWidth={1.25} aria-hidden="true" />
          <h2>{messages.orderSummary}</h2>
        </div>
        <ul className="cat-checkout__items">
          {cart.lineItems.map((item) => (
            <li className="cat-checkout__item" key={item.id}>
              <span>
                {item.name}
                <small>× {item.quantity}</small>
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
          {selected ? <Check size={14} strokeWidth={1.5} /> : null}
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
  const [order, setOrder] = useState<OrderSnapshot | null>(null);
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
      const methods = await cart.getShippingMethods();
      if (methods === null) {
        return;
      }
      setShippingMethods(methods);
      setHasLoadedShippingMethods(true);
      setSelectedShippingMethodId(updated.shippingMethod?.id ?? "");
    });
  }

  function selectShippingMethod(methodId: string) {
    startTransition(async () => {
      const updated = await cart.setShippingMethod(methodId);
      if (updated) {
        setSelectedShippingMethodId(methodId);
      }
    });
  }

  function placeOrder() {
    startTransition(async () => {
      const placed = await cart.placeOrder();
      if (placed) {
        setOrder(placed);
        onOrderPlaced?.(placed);
      }
    });
  }

  if (order) {
    return (
      <main className="cat-root cat-checkout" data-theme={theme}>
        <section className="cat-checkout__success cat-checkout__bezel">
          <div className="cat-checkout__core">
            <span className="cat-checkout__success-icon" aria-hidden="true">
              <Check size={24} strokeWidth={1.25} />
            </span>
            <p className="cat-checkout__eyebrow">{messages.checkout}</p>
            <h1>{messages.orderPlaced}</h1>
            <strong>{order.orderNumber ?? order.id}</strong>
            <a className="cat-checkout__back" href={continueShoppingHref}>
              <ArrowLeft size={15} strokeWidth={1.5} aria-hidden="true" />
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
        <section className="cat-checkout__success cat-checkout__bezel">
          <div className="cat-checkout__core">
            <Package size={24} strokeWidth={1.25} aria-hidden="true" />
            <h1>
              {cart.isLoading || !cart.anonymousId
                ? messages.searching
                : messages.emptyCart}
            </h1>
            <a className="cat-checkout__back" href={continueShoppingHref}>
              <ArrowLeft size={15} strokeWidth={1.5} aria-hidden="true" />
              {messages.continueShopping}
            </a>
          </div>
        </section>
      </main>
    );
  }

  const checkoutBusy = isPending || cart.isMutating;
  const canPlaceOrder =
    hasLoadedShippingMethods &&
    (shippingMethods.length === 0 || Boolean(selectedShippingMethodId)) &&
    !checkoutBusy;

  return (
    <main className="cat-root cat-checkout" data-theme={theme}>
      <header className="cat-checkout__intro">
        <p className="cat-checkout__eyebrow">{messages.checkout}</p>
        <h1>{messages.checkoutTitle}</h1>
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
                <MapPin size={18} strokeWidth={1.25} aria-hidden="true" />
                <h2>{messages.shippingAddress}</h2>
              </div>
              <AddressFields
                address={shippingAddress}
                messages={messages}
                prefix="shipping"
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

          <section className="cat-checkout__bezel">
            <div className="cat-checkout__core">
              <div className="cat-checkout__section-heading">
                <Package size={18} strokeWidth={1.25} aria-hidden="true" />
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
              ) : hasLoadedShippingMethods ? (
                <p className="cat-checkout__empty-methods">
                  {messages.noShippingMethods}
                </p>
              ) : (
                <p className="cat-checkout__empty-methods">
                  {messages.selectShippingMethod}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="cat-checkout__place-island">
        <button
          type="button"
          className="cat-checkout-cta"
          disabled={!canPlaceOrder}
          onClick={placeOrder}
        >
          <span>{checkoutBusy ? messages.placingOrder : messages.placeOrder}</span>
          <span className="cat-checkout-cta__icon" aria-hidden="true">
            <ArrowRight size={16} strokeWidth={1.5} />
          </span>
        </button>
      </div>
    </main>
  );
}
