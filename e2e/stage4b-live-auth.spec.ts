import { test, expect } from "@playwright/test";

test.describe("Stage 4B: Live Authentication Portal & Local Sandbox E2E", () => {
  test("loads /login portal cleanly, validates inputs, and renders login form", async ({ page }) => {
    await page.goto("/login");

    // Check title and branding
    await expect(page).toHaveTitle(/CollectFlow/i);
    await expect(page.getByRole("heading", { name: "CollectFlow" })).toBeVisible();
    await expect(page.getByText(/Live Authentication Sandbox Portal/i)).toBeVisible();

    // Form inputs exist
    const usernameInput = page.getByLabel("Username");
    const passwordInput = page.getByLabel("Password");
    const submitBtn = page.getByRole("button", { name: "Sign In" });

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // Verify mode indicator
    await expect(page.getByText(/Mode: MOCK/i)).toBeVisible();

    // Link back to workspace functions
    const returnLink = page.getByRole("link", { name: /Return to Financial Workspace/i });
    await expect(returnLink).toBeVisible();
    await returnLink.click();
    await expect(page).toHaveURL("/");
  });

  test("mock-mode rejection notice on submission in default mock mode", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Username").fill("sandbox_admin");
    await page.getByLabel("Password").fill("AdminPass123!");
    await page.getByRole("button", { name: "Sign In" }).click();

    // Notice explaining mode guard
    await expect(page.getByRole("alert")).toContainText(
      "Notice: Application is currently in 'mock' mode"
    );
  });
});
