import { test, expect } from "@playwright/test";

const FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const PROTECTED_ROUTES = [
  "/",
  "/customers",
  "/orders",
  "/invoices",
  "/payments",
  "/ar-aging",
  "/reports",
  "/sales-targets",
  "/performance-analytics",
  "/users",
  "/settings",
];

test.describe("Stage 4C.2: Comprehensive Anonymous Protected Route Boundary", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`Unauthenticated direct navigation to ${route} redirects to /login`, async ({ page }) => {
      await page.goto(`${FRONTEND_URL}${route}`);
      await expect(page).toHaveURL(`${FRONTEND_URL}/login`);
      await expect(page.getByRole("heading", { name: "CollectFlow" })).toBeVisible();
      await expect(page.getByText(/Mode: LIVE/i)).toBeVisible();
      // Ensure zero simulated signed-in identity or workspace leaked
      await expect(page.getByText(/Aisha Khan/i)).not.toBeVisible();
      await expect(page.getByText(/Live sandbox/i)).not.toBeVisible();
    });
  }

  test("Authenticated live user sees real user identity and stage notices on unintegrated screens", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/login`);

    const loginPromise = page.waitForResponse(
      (res) => res.url().includes("/api/auth/login") && res.request().method() === "POST"
    );

    await page.getByLabel("Username").fill("sandbox_admin");
    await page.getByLabel("Password").fill("AdminPass123!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    await loginPromise;
    await expect(page).toHaveURL(`${FRONTEND_URL}/`);

    // Verify real user identity in sidebar, NOT mock Aisha Khan
    await expect(page.getByText(/Sandbox Administrator/i)).toBeVisible();
    await expect(page.getByText(/Admin · Live sandbox/i)).toBeVisible();

    // Navigate to /orders
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Orders" }).click();
    await expect(page).toHaveURL(`${FRONTEND_URL}/orders`);

    // Verify Orders screen is integrated with live backend and New Order action is available for Admin
    await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
    await expect(page.getByRole("button", { name: /New Order/i })).toBeVisible();
  });
});
