import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

/**
 * Stage 4 — Sales Targets & Performance Analytics E2E Suite
 * Multi-viewport: 1440px-desktop, 768px-tablet, 390px-mobile, 320px-narrow-mobile
 */

const VIEWPORTS = [
  { width: 1440, height: 900, name: '1440px-desktop' },
  { width: 768, height: 1024, name: '768px-tablet' },
  { width: 390, height: 844, name: '390px-mobile' },
  { width: 320, height: 568, name: '320px-narrow-mobile' },
];

const BASELINE = {
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

async function navigateToSalesTargets(page: Page, width: number) {
  if (width >= 768) {
    const navItem = page.locator('.cf-nav-item', { hasText: 'Sales Targets' });
    await navItem.click();
  } else {
    // Open mobile sidebar via More menu in bottom nav
    const moreBtn = page.locator('.cf-bottom-nav button', { hasText: 'More' });
    await moreBtn.click();
    const navItem = page.locator('.cf-sidebar.cf-menu-open .cf-nav-item', { hasText: 'Sales Targets' });
    await navItem.click();
  }
  await expect(page.locator('h1')).toHaveText('Sales Targets');
}

function getConfigureTargetButton(page: Page) {
  return page.getByRole('button', { name: /Configure (Sales )?Target/i });
}

async function switchRole(page: Page, role: 'admin' | 'finance' | 'sales' | 'viewer') {
  const roleSelector = page.locator('.cf-review-bar button[role="combobox"]').first();
  await roleSelector.click();
  await page.getByRole('option', { name: role }).click();
  await page.waitForTimeout(200);
}

async function assertAll7BaselineInvariants(page: Page) {
  // 1. Invoiced: ₹5,31,000
  const invoiced = page.locator('.cf-metric').filter({ hasText: 'Total invoiced' }).locator('strong');
  await expect(invoiced).toHaveText(`₹${BASELINE.invoiced}`);

  // 2. Outstanding: ₹3,22,000
  const outstanding = page.locator('.cf-metric').filter({ hasText: 'Total outstanding' }).locator('strong');
  await expect(outstanding).toHaveText(`₹${BASELINE.outstanding}`);

  // 3. Cash: ₹2,00,000
  const cash = page.locator('.cf-metric').filter({ hasText: 'Cash collected' }).locator('strong');
  await expect(cash).toHaveText(`₹${BASELINE.cash}`);

  // 4. TDS: ₹9,000
  const tds = page.locator('.cf-metric').filter({ hasText: 'TDS recognized' }).locator('strong');
  await expect(tds).toHaveText(`₹${BASELINE.tds}`);

  // 5. Unbilled: ₹2,95,000
  const unbilled = page.locator('.cf-metric').filter({ hasText: 'Unbilled orders' }).locator('strong');
  await expect(unbilled).toHaveText(`₹${BASELINE.unbilled}`);

  // 6. Settlements: ₹2,09,000
  const settlements = page.locator('.cf-revenue footer strong');
  await expect(settlements).toHaveText(`₹${BASELINE.settlements}`);

  // 7. Reporting as-of date: 30 April 2026 (rendered as 30 Apr 2026 or 30 April 2026)
  const reportingDate = page.locator('.cf-demo-bar');
  await expect(reportingDate).toContainText(/30 Apr(il)? 2026/);
}

test.describe('CollectFlow Stage 4 — Sales Targets & Performance Analytics', () => {
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

  // ─── 1. MULTI-VIEWPORT NAVIGATION & RESPONSIVE LAYOUT ────────────────────

  for (const vp of VIEWPORTS) {
    test(`Navigation and responsive rendering at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/', { waitUntil: 'networkidle' });
      await restoreBaseline(page);

      // Navigate to Sales Targets
      await navigateToSalesTargets(page, vp.width);
      await expect(page.locator('h1')).toHaveText('Sales Targets');
      await expect(page.locator('[data-testid="sales-targets-view"]')).toBeVisible();
      await expect(page.locator('[data-testid="targets-screen"]')).toBeVisible();

      // Check responsive layout
      if (vp.width > 600) {
        // Desktop / tablet table layout
        const table = page.locator('.cf-table-container');
        await expect(table).toBeVisible();
        await expect(page.locator('.cf-table th', { hasText: 'Representative' })).toBeVisible();
        await expect(page.locator('.cf-table th', { hasText: 'Annual Target' })).toBeVisible();
      } else {
        // Mobile cards layout (<=600px)
        const mobileCards = page.locator('.cf-mobile-cards');
        await expect(mobileCards).toBeVisible();
        const cardCount = await mobileCards.locator('.cf-record-card').count();
        expect(cardCount).toBeGreaterThanOrEqual(1);

        // Desktop table should be hidden
        await expect(page.locator('.cf-table-container')).not.toBeVisible();
      }

      // Check horizontal scroll blowout for mobile viewports (<=600px)
      if (vp.width <= 600) {
        const scrollInfo = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollInfo.scrollWidth).toBeLessThanOrEqual(scrollInfo.clientWidth + 1);
      }

      // Capture required viewport screenshot
      const screenshotName = `s4-targets-${vp.name}.png`;
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, screenshotName),
        fullPage: false,
      });
    });
  }

  // ─── 2. DASHBOARD NAVIGATION LINK ────────────────────────────────────────

  test('Navigates cleanly from FinancialDashboard to Sales Targets via direct link', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    const targetsLink = page.locator('[data-testid="link-to-sales-targets"]');
    await expect(targetsLink).toBeVisible();
    await targetsLink.click();

    await expect(page).toHaveURL(/\/sales-targets/);
    await expect(page.locator('h1')).toHaveText('Sales Targets');
    await expect(page.locator('[data-testid="sales-targets-view"]')).toBeVisible();
  });

  // ─── 3. 4-STEP TARGET MUTATION WORKFLOW (1440px desktop & 390px mobile) ──

  test('4-step target mutation workflow at 1440px desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/sales-targets', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Open Configure Target modal
    const configureBtn = getConfigureTargetButton(page);
    await expect(configureBtn).toBeVisible();
    await configureBtn.click();

    const drawer = page.locator('.cf-drawer');
    await expect(drawer).toBeVisible();

    // Step 1: Form
    await expect(drawer.locator('.cf-drawer-header')).toContainText('Configure Sales Target');
    const stepForm = drawer.locator('.cf-demo-progress span[aria-current="step"]');
    await expect(stepForm).toHaveText('Form');

    // Select preset ₹50,00,000
    const presetBtn = drawer.getByRole('button', { name: '₹50,00,000' });
    await presetBtn.click();

    // Capture workflow screenshot during drawer interaction
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's4-target-workflow-1440.png'),
      fullPage: false,
    });

    // Advance to Step 2: Review
    const reviewBtn = drawer.getByRole('button', { name: /Review target changes/i });
    await reviewBtn.click();

    // Step 2: Review
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Review');
    await expect(drawer.locator('table.cf-table')).toContainText('Annual Target');
    await expect(drawer.locator('table.cf-table')).toContainText('₹50,00,000');
    await expect(drawer.locator('.cf-drawer-message')).toContainText(/Verified quota calculation ready for confirmation/i);

    // Advance to Step 3: Confirm
    const continueBtn = drawer.getByRole('button', { name: /Continue to confirmation/i });
    await continueBtn.click();

    // Step 3: Confirm
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Confirm');
    await expect(drawer).toContainText(/Confirm target changes for/i);

    // Submit confirmation
    const confirmSubmitBtn = drawer.getByRole('button', { name: 'Confirm target changes' });
    await confirmSubmitBtn.click();

    // Step 4: Result
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Result');
    await expect(drawer.locator('.cf-success-banner')).toContainText(/Sales target successfully configured/i);

    // Return to workspace
    const returnBtn = drawer.getByRole('button', { name: 'Return to targets' });
    await returnBtn.click();
    await expect(drawer).not.toBeVisible();

    // Verify updated target in the table
    const nehaRow = page.locator('.cf-table tbody tr').filter({ hasText: 'Neha Rao' });
    await expect(nehaRow).toContainText('₹50,00,000');
  });

  test('4-step target mutation workflow at 390px mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sales-targets', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Click Configure Target button
    const configureBtn = getConfigureTargetButton(page);
    await configureBtn.click();

    const drawer = page.locator('.cf-drawer');
    await expect(drawer).toBeVisible();

    // Select preset ₹35,00,000
    const presetBtn = drawer.getByRole('button', { name: '₹35,00,000' });
    await presetBtn.click();

    // Capture mobile workflow screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's4-target-workflow-390.png'),
      fullPage: false,
    });

    // Advance to Review
    await drawer.getByRole('button', { name: /Review target changes/i }).click();
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Review');

    // Advance to Confirm
    await drawer.getByRole('button', { name: /Continue to confirmation/i }).click();
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Confirm');

    // Submit
    await drawer.getByRole('button', { name: 'Confirm target changes' }).click();

    // Result
    await expect(drawer.locator('.cf-success-banner')).toBeVisible();
    await drawer.getByRole('button', { name: 'Return to targets' }).click();
    await expect(drawer).not.toBeVisible();

    // Verify mobile card reflects updated target
    const nehaCard = page.locator('.cf-record-card').filter({ hasText: 'Neha Rao' });
    await expect(nehaCard).toContainText('₹35,00,000');
  });

  // ─── 4. ROLE-BASED ACCESS CONTROL (RBAC) ─────────────────────────────────

  test('Role permissions: Admin & Finance can configure targets; Sales & Viewer are view-only', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/sales-targets', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Default role is finance: Configure Target should be active
    const configureFinance = getConfigureTargetButton(page);
    await expect(configureFinance).toBeEnabled();

    // Switch to sales role
    await switchRole(page, 'sales');
    const configureSales = getConfigureTargetButton(page);
    await expect(configureSales).toBeDisabled();
    await expect(page.locator('.cf-status', { hasText: /Viewing mode/i })).toBeVisible();

    // Switch to viewer role
    await switchRole(page, 'viewer');
    const configureViewer = getConfigureTargetButton(page);
    await expect(configureViewer).toBeDisabled();
    await expect(page.locator('.cf-status', { hasText: /Viewing mode/i })).toBeVisible();

    // Switch to admin role
    await switchRole(page, 'admin');
    const configureAdmin = getConfigureTargetButton(page);
    await expect(configureAdmin).toBeEnabled();

    // Restore to finance role
    await switchRole(page, 'finance');
  });

  // ─── 5. CUSTOM UNVERIFIED INPUT GUARD ────────────────────────────────────

  test('Custom unverified input guard blocks confirmation with review-only banner', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/sales-targets', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Open Configure Target modal
    await getConfigureTargetButton(page).click();
    const drawer = page.locator('.cf-drawer');
    await expect(drawer).toBeVisible();

    // Toggle custom override checkbox
    const overrideCheckbox = drawer.locator('#target-override-checkbox');
    await overrideCheckbox.check();
    await expect(overrideCheckbox).toBeChecked();

    // Enter custom arbitrary monthly target that departs from arithmetic
    const monthlyInput = drawer.locator('#target-monthly');
    await monthlyInput.fill('999999');

    // Click Review
    await drawer.getByRole('button', { name: /Review target changes/i }).click();

    // Verify Review-only banner is displayed
    await expect(drawer.locator('.cf-drawer-message')).toContainText(
      'Review only: custom inputs have no verified scenario outcome',
    );

    // Confirmation button MUST be disabled
    const continueBtn = drawer.getByRole('button', { name: /Continue to confirmation/i });
    await expect(continueBtn).toBeDisabled();

    // Close drawer via cancel button
    await drawer.getByRole('button', { name: 'Back to form' }).click();
    await drawer.getByRole('button', { name: 'Cancel' }).click();
    const discardDialog = drawer.locator('.cf-discard');
    if (await discardDialog.isVisible()) {
      await drawer.getByRole('button', { name: 'Discard inputs' }).click();
    }
  });

  // ─── 6. UNSAVED CHANGES DISCARD DIALOG ───────────────────────────────────

  test('Unsaved changes dialog prompts on Escape or backdrop click when dirty', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/sales-targets', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Open Configure Target modal
    await getConfigureTargetButton(page).click();
    const drawer = page.locator('.cf-drawer');
    await expect(drawer).toBeVisible();

    // Make form dirty by editing the annual target input
    const yearlyInput = drawer.locator('#target-yearly');
    await yearlyInput.fill('4500000');

    // Press Escape key
    await page.keyboard.press('Escape');

    // Verify discard warning dialog appears
    const discardDialog = drawer.locator('.cf-discard');
    await expect(discardDialog).toBeVisible();
    await expect(discardDialog).toContainText('Discard unsaved demo inputs?');

    // Click "Keep editing"
    await discardDialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(discardDialog).not.toBeVisible();
    await expect(drawer).toBeVisible();

    // Press Escape again and click "Discard inputs"
    await page.keyboard.press('Escape');
    await expect(discardDialog).toBeVisible();
    await discardDialog.getByRole('button', { name: 'Discard inputs' }).click();
    await expect(drawer).not.toBeVisible();
  });

  // ─── 7. PERFORMANCE ANALYTICS TAB & LEADERBOARD ──────────────────────────

  test('Performance Analytics view displays KPI metrics, period breakdown, and executive leaderboard', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/sales-targets', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Switch to Performance Analytics tab
    const analyticsTab = page.locator('[data-testid="tab-performance-analytics"]');
    await expect(analyticsTab).toBeVisible();
    await analyticsTab.click();

    const analyticsSection = page.locator('[data-testid="performance-analytics"]');
    await expect(analyticsSection).toBeVisible();

    // Verify 4 KPI Summary Cards
    const metricsGrid = analyticsSection.locator('.cf-metrics');
    await expect(metricsGrid).toContainText('Total Annual Target');
    await expect(metricsGrid).toContainText('Actual Sales Achieved');
    await expect(metricsGrid).toContainText('Overall Achievement');
    await expect(metricsGrid).toContainText('Remaining Target');

    // Verify Period Breakdown Cards
    const periodGrid = analyticsSection.locator('.cf-period-cards-grid');
    await expect(periodGrid).toContainText('Annual Target');
    await expect(periodGrid).toContainText('Half-Yearly Quota');
    await expect(periodGrid).toContainText('Quarterly Quota');
    await expect(periodGrid).toContainText('Monthly Quota');

    // Verify Executive Leaderboard
    const leaderboard = analyticsSection.locator('[data-testid="executive-leaderboard"]');
    await expect(leaderboard).toBeVisible();
    await expect(leaderboard).toContainText('Neha Rao');
    await expect(leaderboard).toContainText('Kavya Nair');
    await expect(leaderboard).toContainText('Arjun Mehta');

    // Test leaderboard search filter
    const searchInput = leaderboard.locator('input[aria-label="Filter executive leaderboard"]');
    await searchInput.fill('Neha');
    await expect(leaderboard).toContainText('Neha Rao');
    await expect(leaderboard).not.toContainText('Kavya Nair');
    await searchInput.fill('');

    // Capture required analytics screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's4-analytics-dashboard-1440.png'),
      fullPage: false,
    });

    // Switch back to Targets Quotas tab
    const targetsTab = page.locator('[data-testid="tab-targets-quotas"]');
    await targetsTab.click();
    await expect(page.locator('[data-testid="targets-screen"]')).toBeVisible();
  });

  // ─── 8. RESET DEMO RESTORATION & ALL 7 FINANCIAL INVARIANTS ──────────────

  test('Reset Demo restores modified targets and all 7 financial invariants', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/sales-targets', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Mutate Neha Rao target to ₹50,00,000
    await getConfigureTargetButton(page).click();
    const drawer = page.locator('.cf-drawer');
    await drawer.getByRole('button', { name: '₹50,00,000' }).click();
    await drawer.getByRole('button', { name: /Review target changes/i }).click();
    await drawer.getByRole('button', { name: /Continue to confirmation/i }).click();
    await drawer.getByRole('button', { name: 'Confirm target changes' }).click();
    await drawer.getByRole('button', { name: 'Return to targets' }).click();

    // Verify mutated value is visible
    await expect(page.locator('.cf-table')).toContainText('₹50,00,000');

    // Trigger Reset Demo
    const resetBtn = page.getByRole('button', { name: /Reset Demo/i });
    await resetBtn.click();
    const confirmBtn = page.getByRole('button', { name: 'Restore baseline' });
    await confirmBtn.waitFor({ state: 'visible' });
    await confirmBtn.click();
    await page.waitForTimeout(400);

    // Verify targets screen restored to baseline (Neha Rao baseline is ₹40,00,000)
    await expect(page.locator('.cf-table')).toContainText('₹40,00,000');

    // Navigate to Dashboard and verify all 7 invariants
    await page.locator('.cf-nav-item', { hasText: 'Dashboard' }).click();
    await expect(page.locator('h1')).toHaveText('Business overview');
    await assertAll7BaselineInvariants(page);

    // Capture required restored baseline screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's4-baseline-restored-1440.png'),
      fullPage: false,
    });
  });

  // ─── 9. MOBILE PREVIEW PERSISTENCE (CF3-05) ──────────────────────────────

  test('Mobile preview persistence (CF3-05) survives route changes into and out of Sales Targets', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    const mobileBtn = page.locator('.cf-review-bar button[title="Mobile preview"]');
    const desktopBtn = page.locator('.cf-review-bar button[title="Desktop preview"]');

    // Switch to Mobile preview
    await mobileBtn.click();
    await expect(mobileBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cf-preview-mobile')).toBeVisible();

    // Navigate to Sales Targets inside mobile preview
    await page.locator('.cf-preview-mobile .cf-bottom-nav button', { hasText: 'More' }).click();
    await page.locator('.cf-preview-mobile .cf-sidebar.cf-menu-open .cf-nav-item', { hasText: 'Sales Targets' }).click();

    await expect(page).toHaveURL(/\/sales-targets/);
    await expect(page.locator('.cf-preview-mobile')).toBeVisible();
    await expect(mobileBtn).toHaveAttribute('aria-pressed', 'true');

    // Navigate back to Dashboard inside mobile preview
    await page.locator('.cf-preview-mobile .cf-bottom-nav button', { hasText: 'Dashboard' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.cf-preview-mobile')).toBeVisible();
    await expect(mobileBtn).toHaveAttribute('aria-pressed', 'true');

    // Restore back to desktop preview
    await desktopBtn.click();
    await expect(desktopBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cf-preview-mobile')).not.toBeVisible();
  });
});
