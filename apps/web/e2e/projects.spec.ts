import { expect, test } from "@playwright/test";

test.describe("projects list", () => {
  test("lists commissions with reference codes", async ({ page }) => {
    await page.goto("/projects");

    await expect(
      page.getByRole("heading", { level: 1, name: /projects & commissions/i }),
    ).toBeVisible();
    await expect(page.getByText("ROB-104", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("ROB-103", { exact: true }).first()).toBeVisible();
  });

  test("filters by pipeline stage", async ({ page }) => {
    await page.goto("/projects");

    await page.getByLabel("Filter by pipeline stage").selectOption("in_design");

    await page.waitForURL(/status=in_design/);
    await expect(page.getByText("ROB-103", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("ROB-104", { exact: true })).toHaveCount(0);
  });

  test("searches by reference code", async ({ page }) => {
    await page.goto("/projects");

    // The topbar has its own search box, so target the filter form's input.
    const search = page.getByRole("searchbox", { name: "Search projects", exact: true });
    await search.fill("ROB-104");
    await search.press("Enter");

    await page.waitForURL(/q=ROB-104/);
    await expect(page.getByText("ROB-104", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("ROB-103", { exact: true })).toHaveCount(0);
  });
});
