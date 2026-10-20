import type { Page } from "@playwright/test";

/**
 * The dashboard opens in designer mode, where `/` redirects to `/today` and the
 * ops surfaces (billing, audit) are hidden from the sidebar. Tests that need the
 * full dashboard set the persisted mode before the first navigation.
 */
export async function useDeveloperMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("robloxops_view_mode", "developer");
  });
}
