import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowRight,
  ChevronDown,
  Minus,
  Package,
  Plus,
  ShoppingBag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  MAX_LINE_ITEM_QUANTITY,
  focusFirstAvailable,
  getFocusable,
  quantityGroupLabel,
  removeItemLabel,
} from "@commerce-ai-tool/core/client";
import type {
  CartSnapshot,
  ResolvedCommerceAISearchMessages,
  CustomerSnapshot,
} from "@commerce-ai-tool/core/client";
import { useLatestRef } from "../hooks/useLatestRef.js";
import { ICON_STROKE } from "../icons.js";

export interface CartPanelProps {
  cart: CartSnapshot | null;
  customer: CustomerSnapshot | null;
  isLoading: boolean;
  isLoggingIn: boolean;
  error: string | null;
  messages: ResolvedCommerceAISearchMessages;
  /** Locale used when formatting a fallback line total. */
  catalogLocale?: string;
  onClose: () => void;
  onRemove: (lineItemId: string) => void;
  onQuantityChange: (lineItemId: string, quantity: number) => void;
  onLogin: (input: { email: string; password: string }) => void;
  onLogout: () => void;
  onCheckout?: (cart: CartSnapshot) => void;
  /** Where focus goes when the panel closes (the cart toggle). */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/** Must match the `max-width` of the full-screen cart sheet in packages/styles. */
const FULL_SCREEN_QUERY = "(max-width: 36rem)";

function subscribeFullScreen(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const query = window.matchMedia(FULL_SCREEN_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getFullScreenSnapshot(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(FULL_SCREEN_QUERY).matches
    : false;
}

/** True while the cart is the full-screen sheet. Never touches `window` during server render. */
function useIsFullScreenSheet(): boolean {
  return useSyncExternalStore(subscribeFullScreen, getFullScreenSnapshot, () => false);
}

function formatLineTotal(
  price: CartSnapshot["lineItems"][number]["price"],
  quantity: number,
  locale?: string,
): string | null {
  if (!price) {
    return null;
  }
  return new Intl.NumberFormat(locale || undefined, {
    style: "currency",
    currency: price.currency,
  }).format(price.amount * quantity);
}

export function CartPanel({
  cart,
  customer,
  isLoading,
  isLoggingIn,
  error,
  messages,
  catalogLocale,
  onClose,
  onRemove,
  onQuantityChange,
  onLogin,
  onLogout,
  onCheckout,
  returnFocusTo,
}: CartPanelProps) {
  const isFullScreen = useIsFullScreenSheet();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const fullScreenRef = useLatestRef(isFullScreen);
  const onCloseRef = useLatestRef(onClose);
  const returnFocusRef = useLatestRef(returnFocusTo);
  // The line whose "+" reached the maximum: that button disables itself, and focus must not leave
  // the panel with it.
  const maxReachedItemRef = useRef<string | null>(null);
  const isEmpty = !cart || cart.lineItems.length === 0;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthExpanded, setIsAuthExpanded] = useState(false);

  // Escape closes the cart at every width. A modal <dialog> on top (the camera) owns its own
  // Escape, so keys from inside a dialog other than the one the widget itself sits in (a host may
  // mount it in its own <dialog>) are ignored here. Escape while an IME composes belongs to the IME.
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      const keyDialog = event.target instanceof Element ? event.target.closest("dialog") : null;
      if (keyDialog && keyDialog !== panelRef.current?.closest("dialog")) return;
      onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCloseRef]);

  // Full-screen (modal): focus moves in on open. On close it returns to the cart toggle whenever
  // focus was lost with the panel (or inside it), so it never falls back to <body>.
  useEffect(() => {
    const panel = panelRef.current;
    const opener = document.activeElement;
    if (fullScreenRef.current) closeRef.current?.focus();
    return () => {
      const active = document.activeElement;
      const lost = !active || active === document.body || Boolean(panel?.contains(active));
      // These refs hold the latest props on purpose: they are read when the panel closes.
      /* eslint-disable react-hooks/exhaustive-deps */
      if (lost || fullScreenRef.current) {
        focusFirstAvailable(returnFocusRef.current?.current, opener);
      }
      /* eslint-enable react-hooks/exhaustive-deps */
    };
  }, [fullScreenRef, returnFocusRef]);

  // After the mutation that took a line to the maximum, the disabled "+" cannot keep focus: move it
  // to that line's "-" so a keyboard user stays inside the panel.
  useEffect(() => {
    const itemId = maxReachedItemRef.current;
    const panel = panelRef.current;
    if (!itemId || !panel || isLoading) return;
    const item = cart?.lineItems.find((line) => line.id === itemId);
    if (!item || item.quantity < MAX_LINE_ITEM_QUANTITY) {
      // Still waiting for the mutation, unless it failed.
      if (!item || error) maxReachedItemRef.current = null;
      return;
    }
    maxReachedItemRef.current = null;
    const active = document.activeElement;
    if (active && active !== document.body && !(active as HTMLButtonElement).disabled) return;
    const row = Array.from(panel.querySelectorAll<HTMLElement>("[data-line-item-id]")).find(
      (element) => element.dataset.lineItemId === itemId,
    );
    focusFirstAvailable(row?.querySelector(".cat-cart-item__qty-btn"));
  });

  // APG: while modal, Tab wraps from the last control to the first and Shift+Tab back.
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !isFullScreen) return;
    const controls = getFocusable(event.currentTarget);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === event.currentTarget)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onLogin({ email, password });
    setPassword("");
  }

  const authBlock = (
    <div className="cat-cart-panel__auth">
      {customer ? (
        <div className="cat-cart-panel__signed-in">
          <span>
            {messages.signedInAs} {customer.email}
          </span>
          <button
            type="button"
            className="cat-cart-panel__sign-out"
            onClick={onLogout}
          >
            {messages.signOut}
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="cat-cart-panel__auth-toggle"
            disabled={isLoggingIn}
            aria-expanded={isAuthExpanded}
            onClick={() => setIsAuthExpanded((expanded) => !expanded)}
          >
            <span className="cat-cart-panel__auth-toggle-copy">
              <span className="cat-cart-panel__auth-icon" aria-hidden="true">
                <UserRound size={14} strokeWidth={ICON_STROKE} />
              </span>
              {messages.signInToSyncCart}
            </span>
            <ChevronDown
              className={isAuthExpanded ? "cat-cart-panel__auth-chevron--open" : ""}
              size={15}
              strokeWidth={ICON_STROKE}
              aria-hidden="true"
            />
          </button>
          {isAuthExpanded ? (
            <form className="cat-cart-panel__auth-form" onSubmit={handleLoginSubmit}>
              <label className="cat-cart-panel__field">
                <span className="cat-cart-panel__label">{messages.email}</span>
                <input
                  className="cat-cart-panel__input"
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  disabled={isLoggingIn}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="cat-cart-panel__field">
                <span className="cat-cart-panel__label">{messages.password}</span>
                <input
                  className="cat-cart-panel__input"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  disabled={isLoggingIn}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button
                type="submit"
                className="cat-cart-panel__submit"
                disabled={isLoggingIn}
              >
                {messages.signIn}
              </button>
            </form>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <section
      ref={panelRef}
      className={`cat-cart-panel${isEmpty ? "" : " cat-cart-panel--with-items"}`}
      role={isFullScreen ? "dialog" : undefined}
      aria-modal={isFullScreen ? true : undefined}
      aria-label={messages.cartAriaLabel}
      onKeyDown={handleKeyDown}
    >
      <header className="cat-cart-panel__header">
        <h2 className="cat-cart-panel__title">{messages.cart}</h2>
        <button
          ref={closeRef}
          type="button"
          className="cat-icon-btn"
          onClick={onClose}
          aria-label={messages.closeCart}
        >
          <X size={16} strokeWidth={ICON_STROKE} />
        </button>
      </header>

      {error && (
        <div className="cat-status cat-status--error" role="alert">
          {error}
        </div>
      )}

      {isEmpty ? (
        <div className="cat-cart-panel__empty">
          <ShoppingBag size={20} strokeWidth={ICON_STROKE} aria-hidden="true" />
          <span>{messages.emptyCart}</span>
        </div>
      ) : (
        <ul className="cat-cart-panel__items">
          {cart.lineItems.map((item) => (
            <li key={item.id} className="cat-cart-item" data-line-item-id={item.id}>
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" className="cat-cart-item__image" />
              ) : (
                <div className="cat-cart-item__image cat-cart-item__image--placeholder">
                  <Package size={16} strokeWidth={ICON_STROKE} aria-hidden="true" />
                </div>
              )}
              <div className="cat-cart-item__info">
                <div className="cat-cart-item__name">{item.name}</div>
                {item.price ? (
                  <div className="cat-cart-item__price">
                    <span>{item.price.formatted} {messages.each}</span>
                    <strong>
                      {item.totalPrice?.formatted ??
                        formatLineTotal(item.price, item.quantity, catalogLocale)}
                    </strong>
                  </div>
                ) : null}
                <div
                  className="cat-cart-item__qty"
                  role="group"
                  aria-label={quantityGroupLabel(messages, item.name)}
                >
                  <button
                    type="button"
                    className="cat-cart-item__qty-btn"
                    aria-label={messages.decreaseQuantity}
                    disabled={isLoading || item.quantity <= 1}
                    onClick={() => onQuantityChange(item.id, item.quantity - 1)}
                  >
                    <Minus size={12} strokeWidth={ICON_STROKE} />
                  </button>
                  <span className="cat-cart-item__qty-value" role="status">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    className="cat-cart-item__qty-btn"
                    aria-label={messages.increaseQuantity}
                    disabled={isLoading || item.quantity >= MAX_LINE_ITEM_QUANTITY}
                    onClick={() => {
                      if (item.quantity + 1 >= MAX_LINE_ITEM_QUANTITY) {
                        maxReachedItemRef.current = item.id;
                      }
                      onQuantityChange(item.id, item.quantity + 1);
                    }}
                  >
                    <Plus size={12} strokeWidth={ICON_STROKE} />
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="cat-icon-btn"
                aria-label={removeItemLabel(messages, item.name)}
                disabled={isLoading}
                onClick={() => onRemove(item.id)}
              >
                <Trash2 size={14} strokeWidth={ICON_STROKE} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {authBlock}

      {!isEmpty && (
        <footer className="cat-cart-panel__footer">
          <div className="cat-cart-panel__total">
            <span>{messages.total}</span>
            <strong>{cart.totalPrice.formatted}</strong>
          </div>
          {onCheckout ? (
            <button
              type="button"
              className="cat-checkout-cta"
              disabled={isLoading}
              onClick={() => onCheckout(cart)}
            >
              <span>{messages.checkout}</span>
              <span className="cat-checkout-cta__icon" aria-hidden="true">
                <ArrowRight size={15} strokeWidth={ICON_STROKE} />
              </span>
            </button>
          ) : null}
        </footer>
      )}
    </section>
  );
}
