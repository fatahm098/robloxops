import { expect, test } from "@playwright/test";

const PROJECT = "/projects/p_104";

test.describe("project detail", () => {
  test("renders the brief for a commission", async ({ page }) => {
    await page.goto(PROJECT);

    await expect(
      page.getByRole("heading", { level: 1, name: /cyber samurai katana/i }),
    ).toBeVisible();
    await expect(page.getByText("ROB-104").first()).toBeVisible();
    await expect(page.getByText("Polygon Limit").first()).toBeVisible();
  });

  test("revision action is present but disabled in demo mode", async ({ page }) => {
    await page.goto(PROJECT);

    const revision = page.getByRole("button", { name: /request revision/i });
    await expect(revision).toBeVisible();
    await expect(revision).toBeDisabled();
  });

  test("shows the outbound approval queue", async ({ page }) => {
    await page.goto(PROJECT);

    await expect(
      page.getByRole("heading", { name: /awaiting approval/i }),
    ).toBeVisible();
    await expect(page.getByText(/1 queued/i)).toBeVisible();

    const approve = page.getByRole("button", { name: /^approve$/i });
    await expect(approve).toBeVisible();
    await expect(approve).toBeDisabled();
    await expect(page.getByRole("button", { name: /^reject$/i })).toBeDisabled();
  });
});
