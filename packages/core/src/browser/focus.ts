// Keyboard focus helpers shared by the React and Angular overlays (camera dialog, cart sheet).
// They only touch the DOM when called, so importing this module is safe during server rendering.
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/**
 * Rendered and not hidden. `checkVisibility()` covers `display: none`, `visibility: hidden` and
 * `hidden` ancestors; browsers without it (and jsdom) fall back to the `hidden` attribute, since
 * `offsetParent` is `null` for every element in jsdom and for fixed-position ones elsewhere.
 */
function isVisible(element: HTMLElement): boolean {
  if (typeof element.checkVisibility === "function") {
    return element.checkVisibility({ visibilityProperty: true });
  }
  return !element.closest("[hidden]");
}

/** The controls inside `container` that Tab can reach, in DOM order. */
export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
}

/** Focuses the first candidate that is connected, enabled and visible; false if none was. */
export function focusFirstAvailable(...candidates: Array<Element | null | undefined>): boolean {
  if (typeof document === "undefined") return false;
  for (const candidate of candidates) {
    if (
      candidate instanceof HTMLElement &&
      candidate !== document.body &&
      candidate.isConnected &&
      !("disabled" in candidate && candidate.disabled === true) &&
      isVisible(candidate)
    ) {
      candidate.focus();
      return true;
    }
  }
  return false;
}
