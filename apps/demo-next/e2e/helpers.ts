import { expect, type Page } from "@playwright/test";

/**
 * `page.goto` that also waits until the widget host has hydrated. The controls are
 * server-rendered, so they exist before React attaches their handlers (`next dev` under parallel
 * load can take seconds) and a key press or click in that window is lost. The demo's
 * `HydrationMarker` sets `data-hydrated` on `<html>` from an effect.
 */
export async function gotoHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}
