import type { CommerceAIConfig } from "@commerce-ai-tool/core";
import { createNextDispatcher, type NextHandlerOptions } from "./next-dispatch.js";
import { routeByName } from "./routes.js";

export type { NextHandlerOptions } from "./next-dispatch.js";
export {
  createNextRouteHandler,
  type NextRouteContext,
  type NextRouteHandler,
} from "./next-route.js";

export interface NextHandlers {
  health: () => Promise<Response>;
  search: (req: Request) => Promise<Response>;
  facetSchema: () => Promise<Response>;
  searchSuggestions: (req: Request) => Promise<Response>;
  searchVoice: (req: Request) => Promise<Response>;
  searchImage: (req: Request) => Promise<Response>;
  tts: (req: Request) => Promise<Response>;
  getCart: (req: Request) => Promise<Response>;
  addToCart: (req: Request) => Promise<Response>;
  addItemsToCart: (req: Request) => Promise<Response>;
  removeFromCart: (req: Request) => Promise<Response>;
  updateCartQuantity: (req: Request) => Promise<Response>;
  setCartAddresses: (req: Request) => Promise<Response>;
  getShippingMethods: (req: Request) => Promise<Response>;
  setShippingMethod: (req: Request) => Promise<Response>;
  createOrder: (req: Request) => Promise<Response>;
  getPaymentMethods: (req: Request) => Promise<Response>;
  authorizePayment: (req: Request) => Promise<Response>;
  getOrder: (req: Request) => Promise<Response>;
  login: (req: Request) => Promise<Response>;
  /** Pass the request so a presented session token reaches `cartSession.onLogout`. */
  logout: (req?: Request) => Promise<Response>;
}

/**
 * One function per route, for hosts that keep a `route.ts` file per endpoint. The catch-all
 * `createNextRouteHandler` serves the same routes from a single file. Both dispatch through the
 * route table the Express router uses, so they behave identically.
 *
 * Rate-limit buckets live in this instance: create it once and share it between route files.
 */
export function createNextHandlers(
  config: CommerceAIConfig,
  options: NextHandlerOptions = {},
): NextHandlers {
  const dispatcher = createNextDispatcher(config, options);
  const dispatch = (name: keyof NextHandlers) => (req?: Request) =>
    dispatcher.dispatch(routeByName(name), req);

  return {
    health: dispatch("health"),
    search: dispatch("search"),
    facetSchema: dispatch("facetSchema"),
    searchSuggestions: dispatch("searchSuggestions"),
    searchVoice: dispatch("searchVoice"),
    searchImage: dispatch("searchImage"),
    tts: dispatch("tts"),
    getCart: dispatch("getCart"),
    addToCart: dispatch("addToCart"),
    addItemsToCart: dispatch("addItemsToCart"),
    removeFromCart: dispatch("removeFromCart"),
    updateCartQuantity: dispatch("updateCartQuantity"),
    setCartAddresses: dispatch("setCartAddresses"),
    getShippingMethods: dispatch("getShippingMethods"),
    setShippingMethod: dispatch("setShippingMethod"),
    createOrder: dispatch("createOrder"),
    getPaymentMethods: dispatch("getPaymentMethods"),
    authorizePayment: dispatch("authorizePayment"),
    getOrder: dispatch("getOrder"),
    login: dispatch("login"),
    logout: dispatch("logout"),
  };
}
