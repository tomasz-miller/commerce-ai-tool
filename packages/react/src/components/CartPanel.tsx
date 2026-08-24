import { type FormEvent, useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import type {
  CartSnapshot,
  CommerceAISearchMessages,
  CustomerSnapshot,
} from "@commerce-ai-tool/core";

export interface CartPanelProps {
  cart: CartSnapshot | null;
  customer: CustomerSnapshot | null;
  isLoading: boolean;
  isLoggingIn: boolean;
  error: string | null;
  messages: CommerceAISearchMessages;
  onClose: () => void;
  onRemove: (lineItemId: string) => void;
  onQuantityChange: (lineItemId: string, quantity: number) => void;
  onLogin: (input: { email: string; password: string }) => void;
  onLogout: () => void;
}

function displayCartError(
  error: string | null,
  messages: CommerceAISearchMessages,
): string | null {
  if (!error) {
    return null;
  }
  if (error === "Invalid credentials") {
    return messages.invalidCredentials;
  }
  if (error === "Sign in failed" || error === "Login failed") {
    return messages.signInFailed;
  }
  return error;
}

export function CartPanel({
  cart,
  customer,
  isLoading,
  isLoggingIn,
  error,
  messages,
  onClose,
  onRemove,
  onQuantityChange,
  onLogin,
  onLogout,
}: CartPanelProps) {
  const isEmpty = !cart || cart.lineItems.length === 0;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const visibleError = displayCartError(error, messages);

  function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onLogin({ email, password });
    setPassword("");
  }

  return (
    <section className="cat-cart-panel" aria-label={messages.cartAriaLabel}>
      <header className="cat-cart-panel__header">
        <h2 className="cat-cart-panel__title">{messages.cart}</h2>
        <button
          type="button"
          className="cat-icon-btn"
          onClick={onClose}
          aria-label={messages.closeCart}
        >
          <X size={16} />
        </button>
      </header>

      {visibleError && (
        <div className="cat-status cat-status--error" role="alert">
          {visibleError}
        </div>
      )}

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
        )}
      </div>

      {isEmpty ? (
        <div className="cat-cart-panel__empty">
          <ShoppingBag size={20} aria-hidden="true" />
          <span>{messages.emptyCart}</span>
        </div>
      ) : (
        <ul className="cat-cart-panel__items">
          {cart.lineItems.map((item) => (
            <li key={item.id} className="cat-cart-item">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" className="cat-cart-item__image" />
              ) : (
                <div className="cat-cart-item__image cat-cart-item__image--placeholder" />
              )}
              <div className="cat-cart-item__info">
                <div className="cat-cart-item__name">{item.name}</div>
                {item.price && (
                  <div className="cat-cart-item__price">{item.price.formatted}</div>
                )}
                <div className="cat-cart-item__qty">
                  <button
                    type="button"
                    className="cat-cart-item__qty-btn"
                    aria-label={messages.decreaseQuantity}
                    disabled={isLoading || item.quantity <= 1}
                    onClick={() => onQuantityChange(item.id, item.quantity - 1)}
                  >
                    <Minus size={12} />
                  </button>
                  <span className="cat-cart-item__qty-value">{item.quantity}</span>
                  <button
                    type="button"
                    className="cat-cart-item__qty-btn"
                    aria-label={messages.increaseQuantity}
                    disabled={isLoading}
                    onClick={() => onQuantityChange(item.id, item.quantity + 1)}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="cat-icon-btn"
                aria-label={messages.removeItem}
                disabled={isLoading}
                onClick={() => onRemove(item.id)}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!isEmpty && (
        <footer className="cat-cart-panel__footer">
          <span>{messages.total}</span>
          <strong>{cart.totalPrice.formatted}</strong>
        </footer>
      )}
    </section>
  );
}
