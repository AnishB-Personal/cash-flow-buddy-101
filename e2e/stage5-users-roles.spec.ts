import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

/**
 * Stage 5 — Users, Roles & Access Management E2E Test Suite
 * Multi-viewport: 1440px-desktop, 768px-tablet, 390px-mobile, 320px-narrow-mobile
 */

const VIEWPORTS = [
  { width: 1440, height: 900, name: '1440px-desktop' },
  { width: 768, height: 1024, name: '768px-tablet' },
  { width: 390, height: 844, name: '390px-mobile' },
  { width: 320, height: 568, name: '320px-narrow-mobile' },
];

const BASELINE_FINANCIALS = {
  invoiced: '5,31,000',
  cash: '2,00,000',
  tds: '9,000',
  settlements: '2,09,000',
  outstanding: '3,22,000',
  unbilled: '2,95,000',
};

async function restoreBaseline(page: Page) {
  const resetBtn = page.getByRole('button', { name: /Reset Demo/i });
  if (await resetBtn.isVisible()) {
    await resetBtn.click();
    const confirmBtn = page.getByRole('button', { name: 'Restore baseline' });
    try {
      await confirmBtn.waitFor({ state: 'visible', timeout: 3000 });
      await confirmBtn.click();
      await page.waitForTimeout(400);
    } catch {
      // baseline dialog not triggered
    }
  }
}

async function navigateToUsers(page: Page, width: number) {
  if (width >= 768) {
    const navItem = page.locator('.cf-sidebar .cf-nav-item', { hasText: 'Users & Roles' });
    await navItem.click();
  } else {
    // Open mobile sidebar via More menu in bottom nav
    const moreBtn = page.locator('.cf-bottom-nav button', { hasText: 'More' });
    await moreBtn.click();
    const navItem = page.locator('.cf-sidebar.cf-menu-open .cf-nav-item', { hasText: 'Users & Roles' });
    await navItem.click();
  }
  await expect(page.locator('h1')).toHaveText('Users & Roles');
  await expect(page.locator('[data-testid="users-screen"]')).toBeVisible();
}

async function switchRole(page: Page, role: 'admin' | 'finance' | 'sales' | 'viewer') {
  const roleSelector = page.locator('button[aria-label="Preview role"]');
  await roleSelector.click({ force: true });
  await page.getByRole('option', { name: role }).click({ force: true });
  await page.waitForTimeout(300);
}

async function assertAll7BaselineFinancialInvariants(page: Page) {
  // Navigate to Dashboard to inspect financial metrics
  const dashboardItem = page.locator('.cf-nav-item', { hasText: 'Dashboard' }).first();
  if (await dashboardItem.isVisible()) {
    await dashboardItem.click();
  } else {
    await page.goto('/', { waitUntil: 'networkidle' });
  }
  await expect(page.locator('h1')).toHaveText('Business overview');

  // 1. Invoiced: ₹5,31,000
  const invoiced = page.locator('.cf-metric').filter({ hasText: 'Total invoiced' }).locator('strong');
  await expect(invoiced).toHaveText(`₹${BASELINE_FINANCIALS.invoiced}`);

  // 2. Outstanding: ₹3,22,000
  const outstanding = page.locator('.cf-metric').filter({ hasText: 'Total outstanding' }).locator('strong');
  await expect(outstanding).toHaveText(`₹${BASELINE_FINANCIALS.outstanding}`);

  // 3. Cash: ₹2,00,000
  const cash = page.locator('.cf-metric').filter({ hasText: 'Cash collected' }).locator('strong');
  await expect(cash).toHaveText(`₹${BASELINE_FINANCIALS.cash}`);

  // 4. TDS: ₹9,000
  const tds = page.locator('.cf-metric').filter({ hasText: 'TDS recognized' }).locator('strong');
  await expect(tds).toHaveText(`₹${BASELINE_FINANCIALS.tds}`);

  // 5. Unbilled: ₹2,95,000
  const unbilled = page.locator('.cf-metric').filter({ hasText: 'Unbilled orders' }).locator('strong');
  await expect(unbilled).toHaveText(`₹${BASELINE_FINANCIALS.unbilled}`);

  // 6. Settlements: ₹2,09,000
  const settlements = page.locator('.cf-revenue footer strong');
  await expect(settlements).toHaveText(`₹${BASELINE_FINANCIALS.settlements}`);

  // 7. Reporting as-of date: 30 April 2026
  const reportingDate = page.locator('.cf-demo-bar');
  await expect(reportingDate).toContainText(/30 Apr(il)? 2026/);
}

test.describe('CollectFlow Stage 5 — Users & Roles E2E Suite', () => {
  let browserErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    browserErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') browserErrors.push(`[console.error] ${msg.text()}`);
    });
    page.on('pageerror', error => {
      browserErrors.push(`[uncaughtException] ${error.message}`);
    });
  });

  test.afterEach(async () => {
    expect(browserErrors, 'Zero unhandled browser console errors').toEqual([]);
  });

  // ─── 1. MULTI-VIEWPORT NAVIGATION, LAYOUT & SCREENSHOTS ───────────────────

  for (const vp of VIEWPORTS) {
    test(`Navigation and responsive rendering across ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/', { waitUntil: 'networkidle' });
      await restoreBaseline(page);

      // Navigate to Users & Roles
      await navigateToUsers(page, vp.width);
      await expect(page.locator('h1')).toHaveText('Users & Roles');
      await expect(page.locator('[data-testid="users-screen"]')).toBeVisible();

      // Check responsive layout
      if (vp.width > 600) {
        // Desktop / tablet table layout
        const tableContainer = page.locator('.cf-table-container');
        await expect(tableContainer).toBeVisible();
        await expect(page.locator('.cf-table th', { hasText: 'User' })).toBeVisible();
        await expect(page.locator('.cf-table th', { hasText: 'Role' })).toBeVisible();
        await expect(page.locator('.cf-table th', { hasText: 'Created Date' })).toBeVisible();
      } else {
        // Mobile cards layout (<=600px)
        const mobileCards = page.locator('.cf-mobile-cards');
        await expect(mobileCards).toBeVisible();
        const cardCount = await mobileCards.locator('.cf-record-card').count();
        expect(cardCount).toBeGreaterThanOrEqual(6);

        // Desktop table should be hidden on mobile
        await expect(page.locator('.cf-table-container')).not.toBeVisible();
      }

      // Check horizontal scroll containment for mobile viewports (<=600px)
      if (vp.width <= 600) {
        const scrollInfo = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollInfo.scrollWidth).toBeLessThanOrEqual(scrollInfo.clientWidth + 1);
      }

      // Capture required viewport screenshot
      const screenshotName = `s5-users-${vp.name}.png`;
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, screenshotName),
        fullPage: false,
      });
    });
  }

  // ─── 2. 5-STEP CREATE USER WORKFLOW (ADMIN ROLE) ─────────────────────────

  test('Complete 5-step create user workflow and password sanitization at 1440px desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/users', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Switch to admin role
    await switchRole(page, 'admin');

    // Click "New User" button
    const newUserBtn = page.locator('[data-testid="btn-new-user"]');
    await expect(newUserBtn).toBeVisible();
    await newUserBtn.click();

    const drawer = page.locator('.cf-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('h2')).toContainText('Provision New User');

    // Step 1: Form Step
    await expect(page.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Form');
    const usernameInput = page.locator('#user-username');
    const passwordInput = page.locator('#user-password');
    const fullNameInput = page.locator('#user-fullname');
    const roleSelect = page.locator('#user-role');

    // Verify password has type="password"
    await expect(passwordInput).toHaveAttribute('type', 'password');

    await usernameInput.fill('rohit.sharma');
    await passwordInput.fill('superSecret123');
    await fullNameInput.fill('Rohit Sharma');
    await roleSelect.selectOption('finance');

    // Advance to Step 2: Validation
    await page.getByRole('button', { name: /proceed to validation/i }).click();

    // Step 2: Validation Step
    await expect(page.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Validation');
    await expect(page.getByText(/is valid and unique/i)).toBeVisible();
    await expect(page.getByText(/password meets minimum length requirement/i)).toBeVisible();

    // Advance to Step 3: Review
    await page.getByRole('button', { name: /continue to review/i }).click();

    // Step 3: Review Step
    await expect(page.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Review');
    await expect(page.getByText('Previous vs proposed changes')).toBeVisible();
    await expect(page.getByText('rohit.sharma')).toBeVisible();
    await expect(page.getByText('Rohit Sharma')).toBeVisible();
    await expect(page.getByText(/demo notice: user creation is simulated in local demo state/i)).toBeVisible();

    // STRICT PASSWORD AUDIT: Ensure password is NEVER rendered in DOM
    const rawDom = await page.content();
    expect(rawDom.includes('superSecret123'), 'Password string must never appear in DOM').toBe(false);

    // Capture required workflow screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's5-users-create-workflow.png'),
      fullPage: false,
    });

    // Advance to Step 4: Confirm
    await page.getByRole('button', { name: /continue to confirmation/i }).click();

    // Step 4: Confirm Step
    await expect(page.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Confirm');
    await expect(page.getByText(/confirm creating user account/i)).toBeVisible();
    await expect(page.getByText(/simulated audit logging/i)).toBeVisible();

    // Execute Confirmation
    await page.getByRole('button', { name: /confirm create user/i }).click();

    // Step 5: Result Step
    await expect(page.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Result');
    await expect(page.getByText(/user account successfully created/i)).toBeVisible();

    // Return to directory
    await page.getByRole('button', { name: /return to user directory/i }).click();
    await expect(drawer).not.toBeVisible();

    // Verify user now exists in table
    const table = page.locator('.cf-table');
    await expect(table).toContainText('Rohit Sharma');
    await expect(table).toContainText('@rohit.sharma');
  });

  // ─── 3. INVOICE-LINKED DELETION SAFEGUARD (NEHA RAO ID: 3) ─────────────────

  test('Blocks deleting user Neha Rao (id: 3) referenced on invoice INV-2026-042', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/users', { waitUntil: 'networkidle' });
    await restoreBaseline(page);
    await switchRole(page, 'admin');

    // Locate Neha Rao (user id: 3 / siliya) row
    const nehaRow = page.locator('[data-testid="user-row-3"]');
    await expect(nehaRow).toBeVisible();

    const deleteBtn = nehaRow.getByRole('button', { name: /delete user siliya/i });
    await deleteBtn.click();

    const drawer = page.locator('.cf-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('h2')).toContainText('Delete User · @siliya');

    // Proceed to Step 2: Validation
    await page.getByRole('button', { name: /proceed to validation/i }).click();

    // Verify exact blocking notice
    const errorNotice = page.getByText(
      "Cannot delete user 'siliya' because they are referenced as sales representative on 1 invoice(s).",
    );
    await expect(errorNotice).toBeVisible();

    // Verify continue button is disabled
    const continueBtn = page.getByRole('button', { name: /continue to review/i });
    await expect(continueBtn).toBeDisabled();

    // Close drawer
    await page.getByRole('button', { name: /close user drawer/i }).click();
    await expect(drawer).not.toBeVisible();

    // Verify Neha Rao still remains in directory
    await expect(page.locator('[data-testid="user-row-3"]')).toBeVisible();
  });

  // ─── 4. ROLE SWITCHING & NON-ADMIN VIEWING MODE ───────────────────────────

  test('Role switching displays viewing mode banner and disables mutations for non-admin roles', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/users', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Switch to Finance role
    await switchRole(page, 'finance');

    // Verify viewing banner is displayed
    const viewingBanner = page.locator('[data-testid="users-viewing-banner"]');
    await expect(viewingBanner).toBeVisible();
    await expect(viewingBanner).toContainText(
      'Viewing mode: User administration is restricted to Administrators. Role permissions are enforced.',
    );

    // Verify "New User" button is disabled
    const disabledNewBtn = page.locator('[data-testid="btn-new-user-disabled"]');
    await expect(disabledNewBtn).toBeVisible();
    await expect(disabledNewBtn).toBeDisabled();

    // Verify row actions are disabled
    const rowEditBtn = page.locator('[data-testid="user-row-4"]').getByRole('button', { name: /edit role/i });
    await expect(rowEditBtn).toBeDisabled();

    const rowDeleteBtn = page.locator('[data-testid="user-row-4"]').getByRole('button', { name: /delete user/i });
    await expect(rowDeleteBtn).toBeDisabled();

    // Capture required viewing mode screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's5-users-viewing-mode.png'),
      fullPage: false,
    });

    // Switch to Sales role
    await switchRole(page, 'sales');
    await expect(viewingBanner).toBeVisible();
    await expect(disabledNewBtn).toBeDisabled();

    // Switch to Viewer role
    await switchRole(page, 'viewer');
    await expect(viewingBanner).toBeVisible();
    await expect(disabledNewBtn).toBeDisabled();
  });

  // ─── 5. MID-DRAWER ROLE RE-VALIDATION ────────────────────────────────────

  test('Mid-drawer role change blocks action with denial banner and prevents confirmation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/users', { waitUntil: 'networkidle' });
    await restoreBaseline(page);
    await switchRole(page, 'admin');

    // Open New User drawer
    await page.locator('[data-testid="btn-new-user"]').click();
    const drawer = page.locator('.cf-drawer');
    await expect(drawer).toBeVisible();

    // Fill form and advance to Review
    await page.locator('#user-username').fill('mid.drawer.check');
    await page.locator('#user-password').fill('password123');
    await page.getByRole('button', { name: /proceed to validation/i }).click();
    await page.getByRole('button', { name: /continue to review/i }).click();
    await expect(page.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Review');

    // Now change acting simulated role in top review bar to 'sales'
    await switchRole(page, 'sales');

    // Verify denial banner is immediately shown in the open drawer
    const denialBanner = page.locator('.cf-denial-banner[role="alert"]');
    await expect(denialBanner).toBeVisible();
    await expect(denialBanner).toContainText(
      'Permission Denied: Simulated role changed to sales. Only Administrators can perform user administration.',
    );

    // Verify continue button is disabled
    const continueBtn = page.getByRole('button', { name: /continue to confirmation/i });
    await expect(continueBtn).toBeDisabled();

    // Close drawer
    await page.getByRole('button', { name: /close user drawer/i }).click();
  });

  // ─── 6. RESET DEMO COMPLETE RESTORATION (USERS, TARGETS, FINANCIALS) ──────

  test('Reset Demo restores all 6 baseline users, Stage 4 targets, and Stage 3 financial invariants', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/users', { waitUntil: 'networkidle' });
    await restoreBaseline(page);
    await switchRole(page, 'admin');

    // Delete user 5 (Arjun Mehta)
    const arjunRow = page.locator('[data-testid="user-row-5"]');
    await expect(arjunRow).toBeVisible();
    await arjunRow.getByRole('button', { name: /delete user anshar/i }).click();

    // Verify cascade notice in Step 1 & 2
    await page.getByRole('button', { name: /proceed to validation/i }).click();
    await expect(page.getByText(/target cascade notice: 1 associated target\(s\)/i)).toBeVisible();

    // Verify cascade disclosure diff in Step 3 Review
    await page.getByRole('button', { name: /continue to review/i }).click();
    await expect(page.getByText('Associated Sales Targets')).toBeVisible();
    await expect(page.getByText(/cascade deleted \(backend on delete cascade\)/i)).toBeVisible();

    // Confirm deletion
    await page.getByRole('button', { name: /continue to confirmation/i }).click();
    await page.getByRole('button', { name: /confirm delete user/i }).click();
    await page.getByRole('button', { name: /return to user directory/i }).click();

    // Verify user 5 is deleted
    await expect(page.locator('[data-testid="user-row-5"]')).not.toBeVisible();
    expect(await page.locator('[data-testid="users-table"] tbody tr').count()).toBe(5);

    // Verify targets cascade deleted: Arjun's target is eliminated, FY 2025-26 total drops to ₹66,00,000
    await page.locator('.cf-sidebar .cf-nav-item', { hasText: 'Sales Targets' }).click();
    await expect(page.locator('h1')).toHaveText('Sales Targets');
    const fyTriggerBeforeReset = page.locator('button[aria-label="Financial year filter"]');
    await fyTriggerBeforeReset.click();
    await page.getByRole('option', { name: 'FY 2025-26' }).click();
    await page.waitForTimeout(300);
    await expect(page.locator('.cf-metrics')).toContainText('₹66,00,000');
    // Ensure Arjun is NOT in targets table
    await expect(page.locator('.cf-table')).not.toContainText('Arjun Mehta');

    // Return to Users to execute reset
    await page.locator('.cf-sidebar .cf-nav-item', { hasText: 'Users & Roles' }).click();

    // Trigger Reset Demo
    await restoreBaseline(page);

    // 1. Verify all 6 baseline users restored in directory
    await expect(page.locator('[data-testid="users-table"] tbody tr')).toHaveCount(6);
    await expect(page.locator('[data-testid="user-row-1"]')).toContainText('System Administrator');
    await expect(page.locator('[data-testid="user-row-2"]')).toContainText('Aisha Khan');
    await expect(page.locator('[data-testid="user-row-3"]')).toContainText('Neha Rao');
    await expect(page.locator('[data-testid="user-row-4"]')).toContainText('Kavya Nair');
    await expect(page.locator('[data-testid="user-row-5"]')).toContainText('Arjun Mehta');
    await expect(page.locator('[data-testid="user-row-6"]')).toContainText('Kavita Rao');

    // 2. Verify Stage 4 targets integrity
    await page.locator('.cf-sidebar .cf-nav-item', { hasText: 'Sales Targets' }).click();
    await expect(page.locator('h1')).toHaveText('Sales Targets');
    // Check FY 2026-27 total target ₹75,00,000
    await expect(page.locator('.cf-metrics')).toContainText('₹75,00,000');

    // Check FY 2025-26 total target ₹91,00,000
    const fyTrigger = page.locator('button[aria-label="Financial year filter"]');
    await fyTrigger.click();
    await page.getByRole('option', { name: 'FY 2025-26' }).click();
    await page.waitForTimeout(300);
    await expect(page.locator('.cf-metrics')).toContainText('₹91,00,000');

    // Reset back to FY 2026-27
    await fyTrigger.click();
    await page.getByRole('option', { name: 'FY 2026-27' }).click();
    await page.waitForTimeout(300);

    // 3. Verify all 7 Stage 3 financial invariants
    await assertAll7BaselineFinancialInvariants(page);
  });
});
