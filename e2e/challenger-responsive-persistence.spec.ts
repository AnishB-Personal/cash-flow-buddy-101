import { test, expect, type Page } from "@playwright/test";

/**
 * Challenger 2: Reports Hub, Viewport Responsiveness & State Persistence
 *
 * Mandatory Adversarial Challenges:
 * 1. 320px narrow mobile: Zero horizontal overflow across /reports (all 5 tabs), /, /sales-targets, and /users.
 * 2. Mobile preview persistence (CF3-05): Survives multi-step navigation across routes and tabs.
 * 3. Reset Demo: Restores all 7 financial invariants, 6 baseline users, and Stage 4 targets, while preserving CF3-05.
 * 4. Zero unhandled browser console errors across all test flows.
 */

async function restoreBaseline(page: Page) {
  const resetBtn = page.getByRole("button", { name: /Reset Demo/i });
  if (await resetBtn.isVisible()) {
    await resetBtn.click();
    const confirmBtn = page.getByRole("button", { name: "Restore baseline" });
    try {
      await confirmBtn.waitFor({ state: "visible", timeout: 3000 });
      await confirmBtn.click();
      await page.waitForTimeout(400);
    } catch {
      // already baseline
    }
  }
}

async function assertZeroHorizontalScroll(page: Page, description: string) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return {
      scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
      clientWidth: Math.max(doc.clientWidth, body.clientWidth),
      diff:
        Math.max(doc.scrollWidth, body.scrollWidth) - Math.max(doc.clientWidth, body.clientWidth),
    };
  });
  expect(
    overflow.diff,
    `Zero horizontal scroll failed on 320px [${description}]: scrollWidth (${overflow.scrollWidth}) > clientWidth (${overflow.clientWidth}) by ${overflow.diff}px`,
  ).toBeLessThanOrEqual(1);
}

test.describe("Challenger 2: Responsive Viewport, Persistence & Restoration", () => {
  let browserErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    browserErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Ignore known harmless favicon or font load errors if any
        if (!text.includes("favicon") && !text.includes("404")) {
          browserErrors.push(`[console.error] ${text}`);
        }
      }
    });
    page.on("pageerror", (err) => {
      browserErrors.push(`[pageerror] ${err.message}`);
    });
  });

  test.afterEach(async () => {
    expect(browserErrors, "Zero unhandled browser console errors or uncaught exceptions").toEqual(
      [],
    );
  });

  // ─── 1. 320px NARROW MOBILE RESPONSIVENESS & ZERO OVERFLOW ──────────────────

  test("320px narrow mobile enforces 0 horizontal scroll across all 5 report tabs and main routes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/reports", { waitUntil: "networkidle" });
    await restoreBaseline(page);

    // Tab 1: Invoices & Receivables
    await expect(page.locator('[data-testid="reports-hub"]')).toBeVisible();
    await expect(page.locator('[data-testid="invoices-report-cards"]')).toBeVisible();
    await expect(page.locator('[data-testid="invoices-report-table"]')).not.toBeVisible();
    await assertZeroHorizontalScroll(page, "Reports Tab 1: Invoices");

    // Tab 2: Collections Ledger
    await page.locator('[data-testid="tab-payments"]').click();
    await expect(page.locator('[data-testid="payments-report-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="payments-report-cards"]')).toBeVisible();
    await expect(page.locator('[data-testid="payments-report-table"]')).not.toBeVisible();
    await assertZeroHorizontalScroll(page, "Reports Tab 2: Payments");

    // Tab 3: Customer Exposure
    await page.locator('[data-testid="tab-customers"]').click();
    await expect(page.locator('[data-testid="customers-report-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="customers-report-cards"]')).toBeVisible();
    await expect(page.locator('[data-testid="customers-report-table"]')).not.toBeVisible();
    await assertZeroHorizontalScroll(page, "Reports Tab 3: Customers");

    // Tab 4: Executive Attainment
    await page.locator('[data-testid="tab-executives"]').click();
    await expect(page.locator('[data-testid="executives-report-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="executives-report-cards"]')).toBeVisible();
    await expect(page.locator('[data-testid="executives-report-table"]')).not.toBeVisible();
    await assertZeroHorizontalScroll(page, "Reports Tab 4: Executives");

    // Tab 5: AR Aging Breakdown
    await page.locator('[data-testid="tab-aging"]').click();
    await expect(page.locator('[data-testid="aging-report-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="aging-buckets-grid"]')).toBeVisible();
    await assertZeroHorizontalScroll(page, "Reports Tab 5: AR Aging");

    // Dashboard on 320px
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveText("Business overview");
    await assertZeroHorizontalScroll(page, "Dashboard Route /");

    // Sales Targets on 320px
    await page.goto("/sales-targets", { waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="targets-screen"]')).toBeVisible();
    await assertZeroHorizontalScroll(page, "Sales Targets Route /sales-targets");

    // Users & Roles on 320px
    await page.goto("/users", { waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="users-screen"]')).toBeVisible();
    await assertZeroHorizontalScroll(page, "Users & Roles Route /users");
  });

  // ─── 2. MOBILE PREVIEW PERSISTENCE (CF3-05) ─────────────────────────────────

  test("Mobile preview mode CF3-05 persists across multi-step route navigation and tab switches", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "networkidle" });
    await restoreBaseline(page);

    const mobileToggle = page.locator('.cf-review-bar button[title="Mobile preview"]');
    await expect(mobileToggle).toBeVisible();

    // 1. Activate Mobile preview on Desktop
    await mobileToggle.click();
    await expect(mobileToggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".cf-app.cf-preview-mobile")).toBeVisible();
    await expect(page.locator(".cf-preview-mobile .cf-frame")).toBeVisible();

    // 2. Navigate into /reports via Mobile Bottom Nav More menu
    await page.locator(".cf-preview-mobile .cf-bottom-nav button", { hasText: "More" }).click();
    await page
      .locator(".cf-preview-mobile .cf-sidebar.cf-menu-open .cf-nav-item", { hasText: "Reports" })
      .click();

    await expect(page).toHaveURL(/\/reports/);
    await expect(page.locator(".cf-app.cf-preview-mobile")).toBeVisible();
    await expect(mobileToggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-testid="reports-hub"]')).toBeVisible();

    // 3. Switch across all 5 report tabs inside mobile preview
    await page.locator('.cf-preview-mobile [data-testid="tab-payments"]').click();
    await expect(
      page.locator('.cf-preview-mobile [data-testid="payments-report-view"]'),
    ).toBeVisible();
    await expect(page.locator(".cf-app.cf-preview-mobile")).toBeVisible();

    await page.locator('.cf-preview-mobile [data-testid="tab-customers"]').click();
    await expect(
      page.locator('.cf-preview-mobile [data-testid="customers-report-view"]'),
    ).toBeVisible();
    await expect(page.locator(".cf-app.cf-preview-mobile")).toBeVisible();

    await page.locator('.cf-preview-mobile [data-testid="tab-executives"]').click();
    await expect(
      page.locator('.cf-preview-mobile [data-testid="executives-report-view"]'),
    ).toBeVisible();
    await expect(page.locator(".cf-app.cf-preview-mobile")).toBeVisible();

    await page.locator('.cf-preview-mobile [data-testid="tab-aging"]').click();
    await expect(
      page.locator('.cf-preview-mobile [data-testid="aging-report-view"]'),
    ).toBeVisible();
    await expect(page.locator(".cf-app.cf-preview-mobile")).toBeVisible();

    // 4. Navigate to Sales Targets inside mobile preview
    await page.locator(".cf-preview-mobile .cf-bottom-nav button", { hasText: "More" }).click();
    await page
      .locator(".cf-preview-mobile .cf-sidebar.cf-menu-open .cf-nav-item", {
        hasText: "Sales Targets",
      })
      .click();

    await expect(page).toHaveURL(/\/sales-targets/);
    await expect(page.locator(".cf-app.cf-preview-mobile")).toBeVisible();
    await expect(mobileToggle).toHaveAttribute("aria-pressed", "true");

    // 5. Navigate to Users inside mobile preview
    await page.locator(".cf-preview-mobile .cf-bottom-nav button", { hasText: "More" }).click();
    await page
      .locator(".cf-preview-mobile .cf-sidebar.cf-menu-open .cf-nav-item", {
        hasText: "Users & Roles",
      })
      .click();

    await expect(page).toHaveURL(/\/users/);
    await expect(page.locator(".cf-app.cf-preview-mobile")).toBeVisible();
    await expect(mobileToggle).toHaveAttribute("aria-pressed", "true");

    // 6. Navigate back to Dashboard inside mobile preview
    await page
      .locator(".cf-preview-mobile .cf-bottom-nav button", { hasText: "Dashboard" })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".cf-app.cf-preview-mobile")).toBeVisible();
    await expect(mobileToggle).toHaveAttribute("aria-pressed", "true");
  });

  // ─── 3. RESET DEMO FINANCIAL INVARIANTS & PREVIEW RESTORATION ───────────────

  test("Reset Demo restores all 7 financial invariants, 6 baseline users, Stage 4 targets, and preserves mobile preview", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/reports", { waitUntil: "networkidle" });

    // Enable mobile preview first
    const mobileToggle = page.locator('.cf-review-bar button[title="Mobile preview"]');
    await mobileToggle.click();
    await expect(mobileToggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".cf-app.cf-preview-mobile")).toBeVisible();

    // Modify state: switch FY in reports
    const fyDropdown = page.locator(
      '[data-testid="reports-hub"] button[aria-label="Financial year"]',
    );
    await fyDropdown.click();
    await page.getByRole("option", { name: "FY 2025-26" }).click();
    await page.waitForTimeout(300);

    // Trigger Reset Demo
    await restoreBaseline(page);

    // CF3-05: Verify Mobile preview is still active after Reset Demo!
    await expect(page.locator(".cf-app.cf-preview-mobile")).toBeVisible();
    await expect(mobileToggle).toHaveAttribute("aria-pressed", "true");

    // Navigate to Dashboard to verify all 7 financial invariants
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveText("Business overview");

    // 1. Invoiced: ₹5,31,000
    await expect(
      page.locator(".cf-metric").filter({ hasText: "Total invoiced" }).locator("strong"),
    ).toHaveText("₹5,31,000");

    // 2. Outstanding: ₹3,22,000
    await expect(
      page.locator(".cf-metric").filter({ hasText: "Total outstanding" }).locator("strong"),
    ).toHaveText("₹3,22,000");

    // 3. Cash: ₹2,00,000
    await expect(
      page.locator(".cf-metric").filter({ hasText: "Cash collected" }).locator("strong"),
    ).toHaveText("₹2,00,000");

    // 4. TDS: ₹9,000
    await expect(
      page.locator(".cf-metric").filter({ hasText: "TDS recognized" }).locator("strong"),
    ).toHaveText("₹9,000");

    // 5. Unbilled Orders: ₹2,95,000
    await expect(
      page.locator(".cf-metric").filter({ hasText: "Unbilled orders" }).locator("strong"),
    ).toHaveText("₹2,95,000");

    // 6. Settlements: ₹2,09,000
    await expect(page.locator(".cf-revenue footer strong")).toHaveText("₹2,09,000");

    // 7. Pinned Reporting Date: 30 April 2026
    await expect(page.locator(".cf-demo-bar")).toContainText(/30 Apr(il)? 2026/);

    // Verify 6 Baseline Users on /users
    await page.goto("/users", { waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="users-screen"]')).toBeVisible();

    const expectedUsers = [
      { username: "admin", name: "System Administrator" },
      { username: "finance_lead", name: "Aisha Khan" },
      { username: "siliya", name: "Neha Rao" },
      { username: "syama", name: "Kavya Nair" },
      { username: "anshar", name: "Arjun Mehta" },
      { username: "auditor", name: "Kavita Rao" },
    ];

    for (const u of expectedUsers) {
      await expect(page.locator(`text=${u.username}`).first()).toBeVisible();
      await expect(page.locator(`text=${u.name}`).first()).toBeVisible();
    }

    // Verify Stage 4 Targets on /sales-targets
    await page.goto("/sales-targets", { waitUntil: "networkidle" });
    await expect(page.locator('[data-testid="targets-screen"]')).toBeVisible();
    await expect(
      page.locator(".cf-metric").filter({ hasText: "Annual Target Quota" }).locator("strong"),
    ).toHaveText("₹75,00,000");
    await expect(
      page.locator(".cf-metric").filter({ hasText: "Overall Attainment" }).locator("strong"),
    ).toHaveText("6%");
  });
});
