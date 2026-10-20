import { expect, test } from "@playwright/test";

test.describe("revisions", () => {
  test("lists client revision requests with project references", async ({ page }) => {
    await page.goto("/revisions");

    await expect(
      page.getByRole("heading", { level: 1, name: /^revisions$/i }),
    ).toBeVisible();
    await expect(page.getByText(/ROB-\d+/).first()).toBeVisible();
  });
});
