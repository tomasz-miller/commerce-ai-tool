---
"@commerce-ai-tool/core": minor
"@commerce-ai-tool/react": minor
"@commerce-ai-tool/angular": minor
---

Focus management for the camera overlay and the cart sheet. The camera overlay is a native modal `<dialog>` in React too (as in Angular): focus moves to the capture button on open, Tab wraps inside it, Escape closes it or dismisses the camera error, and focus returns to the camera button. The cart closes on Escape at every width and returns focus to the cart toggle; at 36rem and below, where it is a full-screen sheet, it also gets `role="dialog"` and `aria-modal`, takes focus on open and wraps Tab. The React cart toggle no longer sets `aria-pressed` (`aria-expanded` only), and the cart quantity "+" button is disabled at 99, the maximum the server accepts. Hosts that style or query the React overlay as a `div` must target `dialog.cat-camera-overlay` instead.

`@commerce-ai-tool/core/client` adds `getFocusable(container)` and `focusFirstAvailable(...candidates)`, the keyboard focus helpers both widgets use (reachable controls in DOM order, skipping disabled and hidden ones; focus the first connected, enabled, visible element).
