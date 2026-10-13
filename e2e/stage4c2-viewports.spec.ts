import { test, expect } from "@playwright/test";

const FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || "http://127.0.0.1:8000";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "narrow-320", width: 320, height: 568 },
];

for (const vp of VIEWPORTS) {
  test.describe(`Responsive Viewport: ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`Verify /login and live workspace rendering at ${vp.width}px`, async ({ page }) => {
      // 1. Visit /login
      await page.goto(`${FRONTEND_URL}/login`);
      await expect(page.getByRole("heading", { name: "CollectFlow" })).toBeVisible();
      await expect(page.getByText(/Mode: LIVE/i)).toBeVisible();

      // Login as sandbox_admin
      const loginPromise = page.waitForResponse(
        (res) => res.url().includes("/api/auth/login") && res.request().method() === "POST"
      );

      await page.getByLabel("Username").fill("sandbox_admin");
      await page.getByLabel("Password").fill("AdminPass123!");
      await page.getByRole("button", { name: /Sign In/i }).click();

      await loginPromise;
      await expect(page).toHaveURL(`${FRONTEND_URL}/`);
      await expect(page.getByText(/Live Sandbox Workspace/i)).toBeVisible();

      // Ensure mock workspace controls are absent
      await expect(page.getByText(/Mock workspace/i)).not.toBeVisible();
      await expect(page.getByRole("button", { name: /Reset Demo/i })).not.toBeVisible();
    });
  });
}
