import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Package, Truck } from "lucide-react";
import {
  resolveCommerceAISearchMessages,
  type CommerceAISearchMessages,
  type OrderSnapshot,
  type ThemeMode,
} from "@commerce-ai-tool/core";
import { useCart } from "../hooks/useCart.js";
import { ICON_STROKE } from "../icons.js";
import "../styles/commerce-ai-search.css";

export interface CommerceAIOrderStatusProps {
  apiBaseUrl: string;
  orderNumber?: string;
  theme?: ThemeMode;
  catalogLocale?: string;
  currency?: string;
  country?: string;
  messages?: Partial<CommerceAISearchMessages>;
  continueShoppingHref?: string;
  orderStatusHref?: string;
}

function formatAddress(
  address: NonNullable<OrderSnapshot["shippingAddress"]>,
): string {
  return [
    `${address.firstName} ${address.lastName}`,
    address.streetName,
    address.additionalStreetInfo,
    `${address.postalCode} ${address.city}`,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function formatPlacedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const utc = date.toISOString();
  return `${utc.slice(0, 10)} ${utc.slice(11, 16)} UTC`;
}

function orderHref(orderStatusHref: string, orderNumber: string): string {
  const separator = orderStatusHref.includes("?") ? "&" : "?";
  return `${orderStatusHref}${separator}orderNumber=${encodeURIComponent(orderNumber)}`;
}

function StatusBadge({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }
  return (
    <span className="cat-order-status__badge">
      <small>{label}</small>
      {value}
    </span>
  );
}

export function CommerceAIOrderStatus({
  apiBaseUrl,
  orderNumber = "",
  theme = "auto",
  catalogLocale,
  currency,
  country,
  messages: messageOverrides,
  continueShoppingHref = "/",
  orderStatusHref = "/orders",
}: CommerceAIOrderStatusProps) {
  const messages = useMemo(
    () => resolveCommerceAISearchMessages(messageOverrides),
    [messageOverrides],
  );
  const cart = useCart({ apiBaseUrl, catalogLocale, currency, country });
  const trimmedNumber = orderNumber.trim();
  const [order, setOrder] = useState<OrderSnapshot | null>(null);
  const [orders, setOrders] = useState<OrderSnapshot[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!cart.anonymousId) {
      return;
    }
    let cancelled = false;
    setLoaded(false);
    setOrder(null);
    setOrders(null);
    const load = trimmedNumber
      ? cart.getOrder(trimmedNumber).then((next) => {
          if (!cancelled) {
            setOrder(next);
            setLoaded(true);
          }
        })
      : cart.listOrders().then((next) => {
          if (!cancelled) {
            setOrders(next);
            setLoaded(true);
          }
        });
    void load;
    return () => {
      cancelled = true;
    };
  }, [cart.anonymousId, cart.getOrder, cart.listOrders, trimmedNumber]);

  if (!loaded || cart.isLoading) {
    return (
      <main className="cat-root cat-checkout" data-theme={theme}>
        <section className="cat-checkout__empty cat-checkout__bezel">
          <div className="cat-checkout__core">
            <Package size={24} strokeWidth={ICON_STROKE} aria-hidden="true" />
            <h1>{messages.searching}</h1>
          </div>
        </section>
      </main>
    );
  }

  if (!trimmedNumber) {
    if (!orders?.length) {
      return (
        <main className="cat-root cat-checkout" data-theme={theme}>
          <section className="cat-checkout__empty cat-checkout__bezel">
            <div className="cat-checkout__core">
              <Package size={24} strokeWidth={ICON_STROKE} aria-hidden="true" />
              <h1>{messages.noOrdersYet}</h1>
              <a className="cat-checkout__back" href={continueShoppingHref}>
                <ArrowLeft size={15} strokeWidth={ICON_STROKE} aria-hidden="true" />
                {messages.continueShopping}
              </a>
            </div>
          </section>
        </main>
      );
    }

    return (
      <main className="cat-root cat-checkout" data-theme={theme}>
        <header className="cat-checkout__intro">
          <p className="cat-checkout__eyebrow">{messages.orderStatus}</p>
          <h1>{messages.yourOrders}</h1>
        </header>

        {cart.error ? (
          <div className="cat-status cat-status--error" role="alert">
            {cart.error}
          </div>
        ) : null}

        <section className="cat-checkout__bezel cat-checkout__summary">
          <div className="cat-checkout__core">
            <ul className="cat-order-status__list">
              {orders.map((item) => {
                const number = item.orderNumber ?? item.id;
                return (
                  <li key={item.id}>
                    <a className="cat-order-status__list-link" href={orderHref(orderStatusHref, number)}>
                      <span className="cat-order-status__list-copy">
                        <strong>{number}</strong>
                        {item.createdAt ? <small>{formatPlacedAt(item.createdAt)}</small> : null}
                      </span>
                      <span className="cat-order-status__list-meta">
                        {item.orderState ? <small>{item.orderState}</small> : null}
                        <strong>{item.totalPrice.formatted}</strong>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <a className="cat-checkout__back" href={continueShoppingHref}>
          <ArrowLeft size={15} strokeWidth={ICON_STROKE} aria-hidden="true" />
          {messages.continueShopping}
        </a>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="cat-root cat-checkout" data-theme={theme}>
        <section className="cat-checkout__empty cat-checkout__bezel">
          <div className="cat-checkout__core">
            <Package size={24} strokeWidth={ICON_STROKE} aria-hidden="true" />
            <h1>{messages.orderNotFound}</h1>
            <a className="cat-checkout__back" href={continueShoppingHref}>
              <ArrowLeft size={15} strokeWidth={ICON_STROKE} aria-hidden="true" />
              {messages.continueShopping}
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="cat-root cat-checkout" data-theme={theme}>
      <header className="cat-checkout__intro">
        <p className="cat-checkout__eyebrow">{messages.orderStatus}</p>
        <h1>{order.orderNumber ?? order.id}</h1>
        <div className="cat-order-status__badges">
          <StatusBadge label={messages.orderStatus} value={order.orderState} />
          <StatusBadge label={messages.paymentStateLabel} value={order.paymentState} />
          <StatusBadge label={messages.shipmentStateLabel} value={order.shipmentState} />
        </div>
        {order.createdAt ? (
          <p className="cat-order-status__placed">
            {messages.orderPlacedAt} {formatPlacedAt(order.createdAt)}
          </p>
        ) : null}
      </header>

      {cart.error ? (
        <div className="cat-status cat-status--error" role="alert">
          {cart.error}
        </div>
      ) : null}

      <div className="cat-checkout__layout">
        <section className="cat-checkout__bezel cat-checkout__summary">
          <div className="cat-checkout__core">
            <div className="cat-checkout__section-heading">
              <Package size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
              <h2>{messages.orderSummary}</h2>
            </div>
            <ul className="cat-checkout__items">
              {order.lineItems.map((item) => (
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
                  <strong>{item.totalPrice?.formatted ?? item.price?.formatted ?? "—"}</strong>
                </li>
              ))}
            </ul>
            <div className="cat-checkout__summary-total">
              <span>{messages.total}</span>
              <strong>{order.totalPrice.formatted}</strong>
            </div>
          </div>
        </section>

        <div className="cat-checkout__flow">
          {order.shippingAddress ? (
            <section className="cat-checkout__bezel">
              <div className="cat-checkout__core">
                <h2>{messages.shippingAddress}</h2>
                <p className="cat-order-status__copy">{formatAddress(order.shippingAddress)}</p>
                {order.shippingMethod ? (
                  <p className="cat-order-status__copy">{order.shippingMethod.name}</p>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="cat-checkout__bezel">
            <div className="cat-checkout__core">
              <div className="cat-checkout__section-heading">
                <Truck size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
                <h2>{messages.shipmentStateLabel}</h2>
              </div>
              {order.deliveries?.length ? (
                <ul className="cat-order-status__tracking">
                  {order.deliveries.map((delivery) => (
                    <li key={delivery.id}>
                      <strong>{messages.trackingNumber}</strong>
                      <span>{delivery.trackingId ?? "—"}</span>
                      {delivery.carrier ? (
                        <small>
                          {messages.carrier}: {delivery.carrier}
                        </small>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="cat-checkout__empty-methods">{messages.noTrackingYet}</p>
              )}
            </div>
          </section>
        </div>
      </div>

      <a className="cat-checkout__back" href={continueShoppingHref}>
        <ArrowLeft size={15} strokeWidth={ICON_STROKE} aria-hidden="true" />
        {messages.continueShopping}
      </a>
    </main>
  );
}
