import { expect, test } from "@playwright/test";

import { useDeveloperMode } from "./helpers";

test.describe("overview", () => {
  test("developer mode reaches the studio operations hub from the sidebar", async ({
    page,
  }) => {
    await useDeveloperMode(page);
    // Load a neutral route first: a hard load of "/" always bounces to /today
    // because the provider hydrates in designer mode before it reads storage.
    await page.goto("/today");

    const overviewLink = page.getByRole("link", { name: "Overview" });
    await expect(overviewLink).toBeVisible();
    await overviewLink.click();

    await expect(
      page.getByRole("heading", { level: 1, name: /studio operations hub/i }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("designer mode redirects the root path to the focused day view", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/today$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /selamat datang/i }),
    ).toBeVisible();
  });
});
