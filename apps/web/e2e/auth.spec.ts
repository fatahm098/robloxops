import { expect, test } from "@playwright/test";

test.describe("auth screens", () => {
  test("login page offers the demo entry point", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: "Sign in to RobloxOps" }),
    ).toBeVisible();

    const demoLink = page.getByRole("link", { name: /continue in demo mode/i }).first();
    await expect(demoLink).toBeVisible();

    await demoLink.click();

    // Designer mode is the default, so the root path lands on /today.
    await expect(page).toHaveURL(/\/today$/);
    await expect(
      page.getByRole("heading", { name: /selamat datang/i }),
    ).toBeVisible();
  });

  test("signup page renders the workspace form", async ({ page }) => {
    await page.goto("/signup");

    await expect(
      page.getByRole("heading", { name: /create your studio workspace/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /continue in demo mode/i }).first()).toBeVisible();
  });
});
