import { InjectionToken } from "@angular/core";

/**
 * The `fetch` the widget's HTTP calls (search, suggestions, image, voice, cart) go through.
 * Provide your own to add what Angular's `HttpClient` interceptors would: an auth or XSRF header,
 * base-URL rewriting, logging, `redirect: "error"`, or a test double.
 *
 * ```ts
 * providers: [{ provide: COMMERCE_AI_FETCH, useValue: (input, init) => fetch(input, { ...init, credentials: "include" }) }]
 * ```
 *
 * The default calls the global `fetch` on each request, so it also follows a later replacement of
 * `globalThis.fetch`.
 */
export const COMMERCE_AI_FETCH = new InjectionToken<typeof fetch>("COMMERCE_AI_FETCH", {
  providedIn: "root",
  factory: () => (input, init) => globalThis.fetch(input, init),
});
