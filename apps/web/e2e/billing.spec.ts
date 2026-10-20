import { expect, test } from "@playwright/test";

test.describe("billing", () => {
  test("shows the plan and marks the demo data as simulated", async ({ page }) => {
    await page.goto("/billing");

    await expect(
      page.getByRole("heading", { level: 1, name: /billing & plan/i }),
    ).toBeVisible();
    await expect(page.getByText("Simulated", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^invoices$/i })).toBeVisible();
  });
});
