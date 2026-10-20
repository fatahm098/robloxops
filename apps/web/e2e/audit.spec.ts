import { expect, test } from "@playwright/test";

test.describe("audit log", () => {
  test("renders agent audit entries", async ({ page }) => {
    await page.goto("/audit");

    await expect(
      page.getByRole("heading", { level: 1, name: /agent audit log/i }),
    ).toBeVisible();

    const rows = page.getByRole("row");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(1);
  });
});
