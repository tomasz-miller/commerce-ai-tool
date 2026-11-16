"use client";

import { useEffect } from "react";

/**
 * Sets `data-hydrated="true"` on `<html>` once the widget host has hydrated. Server-rendered
 * controls exist before React attaches their handlers, so e2e specs wait for this attribute
 * before interacting (see `e2e/helpers.ts`). Rendered next to the widget so that it commits
 * together with it.
 */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
