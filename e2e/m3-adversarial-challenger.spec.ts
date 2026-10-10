import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function restoreBaseline(page: Page) {
  const resetBtn = page.getByRole('button', { name: /Reset Demo/i });
  if (await resetBtn.isVisible()) {
    await resetBtn.click();
    const confirmBtn = page.getByRole('button', { name: 'Restore baseline' });
    await confirmBtn.waitFor({ state: 'visible' });
    await confirmBtn.click();
    await page.waitForTimeout(400);
  }
}

async function navigateToScreen(page: Page, screenName: 'Dashboard' | 'Orders' | 'Invoices' | 'Payments' | 'AR Aging' | 'Customers' | 'Settings', width: number) {
  const expectedHeading = screenName === 'Dashboard' ? 'Business overview' : screenName;
  if (width >= 768) {
    const navItem = page.locator('.cf-nav-item', { hasText: screenName });
    await navItem.click();
  } else {
    if (['Dashboard', 'Orders', 'Invoices', 'Payments'].includes(screenName)) {
      const bottomNav = page.locator('.cf-bottom-nav button', { hasText: screenName });
      await bottomNav.click();
    } else {
      await page.locator('.cf-bottom-nav button', { hasText: 'More' }).click();
      await page.locator('.cf-nav-item', { hasText: screenName }).click();
    }
  }
  await expect(page.locator('h1')).toHaveText(expectedHeading);
}

const BASELINE = {
  invoiced: '5,31,000',
  cash: '2,00,000',
  tds: '9,000',
  settlements: '2,09,000',
  outstanding: '3,22,000',
  unbilled: '2,95,000',
};

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

  // 7. Reporting as-of date: 30 April 2026 (rendered as 30 Apr 2026)
  const reportingDate = page.locator('.cf-demo-bar');
  await expect(reportingDate).toContainText(/30 Apr(il)? 2026/);
}

test.describe('Adversarial Challenge M3: Invariants, Deep Mutations & Viewport Integrity', () => {
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

  // ─── CHALLENGE 1: MUTATING ACTIONS GENUINELY MUTATE DOM & METRICS BEFORE RESET ───

  test('Mutation Challenge 1A: Record Partial Payment genuinely updates Invoices DOM, Payments Ledger, and Dashboard KPIs before reset', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/invoices', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Initial state check in Invoices table
    const inv042Row = page.locator('.cf-table tbody tr').filter({ hasText: 'INV-2026-042' });
    await expect(inv042Row).toBeVisible();
    await expect(inv042Row).toContainText('₹3,22,000');
    await expect(inv042Row).toContainText(/Partial/i);

    // Perform partial cash payment of ₹1,00,000
    await inv042Row.locator('[aria-label^="Actions for"]').click();
    await page.locator('.cf-row-menu').getByRole('button', { name: /Record Payment/i }).click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /Review changes/i }).click();
    await dialog.getByRole('button', { name: /Continue to confirmation/i }).click();
    await dialog.getByRole('button', { name: /Confirm payment/i }).click();
    await dialog.getByRole('button', { name: /Return to workspace/i }).click();
    await expect(dialog).not.toBeVisible();

    // DOM Mutation Check 1: Invoices table reflects reduced outstanding balance
    await expect(inv042Row).toContainText('₹2,22,000');

    // DOM Mutation Check 2: Navigate to Payments ledger and verify new payment record exists
    await navigateToScreen(page, 'Payments', 1440);
    const paymentsTable = page.locator('.cf-payments-table tbody tr');
    await expect(paymentsTable).toHaveCount(2); // Baseline had 1, now 2

    const newPaymentRow = paymentsTable.filter({ hasText: 'UTR-HDFC-9918273645' });
    await expect(newPaymentRow).toBeVisible();
    await expect(newPaymentRow).toContainText('₹1,00,000');
    await expect(newPaymentRow).toContainText('NEFT');

    // DOM Mutation Check 3: Dashboard KPIs reflect updated figures BEFORE Reset Demo
    await navigateToScreen(page, 'Dashboard', 1440);
    await expect(page.locator('.cf-metric').filter({ hasText: 'Cash collected' }).locator('strong')).toHaveText('₹3,00,000');
    await expect(page.locator('.cf-metric').filter({ hasText: 'TDS recognized' }).locator('strong')).toHaveText('₹9,000');
    await expect(page.locator('.cf-revenue footer strong')).toHaveText('₹3,09,000');
    await expect(page.locator('.cf-metric').filter({ hasText: 'Total outstanding' }).locator('strong')).toHaveText('₹2,22,000');
    await expect(page.locator('.cf-metric').filter({ hasText: 'Total invoiced' }).locator('strong')).toHaveText('₹5,31,000');
    await expect(page.locator('.cf-metric').filter({ hasText: 'Unbilled orders' }).locator('strong')).toHaveText('₹2,95,000');
    // Settlement rate: (3,09,000 / 5,31,000) = 58.2%
    await expect(page.locator('.cf-metric').filter({ hasText: 'Settlement Rate' }).locator('strong')).toHaveText('58.2%');

    // Execute Reset Demo and verify all 7 invariants restored
    await restoreBaseline(page);
    await assertAll7BaselineInvariants(page);
  });

  test('Mutation Challenge 1B: Full Settlement transitions invoice to PAID and blocks further Record Payment actions', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/invoices', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    const inv042Row = page.locator('.cf-table tbody tr').filter({ hasText: 'INV-2026-042' });
    await inv042Row.locator('[aria-label^="Actions for"]').click();
    await page.locator('.cf-row-menu').getByRole('button', { name: /Record Payment/i }).click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Select Full Settlement preset
    const fullPresetBtn = dialog.getByRole('button', { name: /Full Settlement/i });
    await expect(fullPresetBtn).toBeVisible();
    await fullPresetBtn.click();

    // Complete workflow
    await dialog.getByRole('button', { name: /Review changes/i }).click();
    await dialog.getByRole('button', { name: /Continue to confirmation/i }).click();
    await dialog.getByRole('button', { name: /Confirm payment/i }).click();
    await dialog.getByRole('button', { name: /Return to workspace/i }).click();
    await expect(dialog).not.toBeVisible();

    // Invoices DOM: Status is PAID, Outstanding is ₹0
    await expect(inv042Row).toContainText(/Paid/i);
    await expect(inv042Row).toContainText('₹0');

    // Action menu on PAID invoice: Record Payment should be disabled or absent
    await inv042Row.locator('[aria-label^="Actions for"]').click();
    const recordPaymentOption = page.locator('.cf-row-menu').getByRole('button', { name: /Record Payment/i });
    if (await recordPaymentOption.isVisible({ timeout: 1000 }).catch(() => false)) {
      const isDisabled = await recordPaymentOption.evaluate(el => (el as HTMLButtonElement).disabled);
      expect(isDisabled, 'Record Payment button on PAID invoice must be disabled').toBe(true);
    }
    await page.keyboard.press('Escape');

    // Dashboard: Outstanding is ₹0, Cash is ₹5,22,000, Settlements is ₹5,31,000
    await navigateToScreen(page, 'Dashboard', 1440);
    await expect(page.locator('.cf-metric').filter({ hasText: 'Total outstanding' }).locator('strong')).toHaveText('₹0');
    await expect(page.locator('.cf-metric').filter({ hasText: 'Cash collected' }).locator('strong')).toHaveText('₹5,22,000');
    await expect(page.locator('.cf-revenue footer strong')).toHaveText('₹5,31,000');
    await expect(page.locator('.cf-metric').filter({ hasText: 'Settlement Rate' }).locator('strong')).toHaveText('100%');

    // Reset Demo restoration
    await restoreBaseline(page);
    await assertAll7BaselineInvariants(page);
  });

  test('Mutation Challenge 1C: Cancel Unpaid Invoice updates Dashboard KPIs and blocks Record Payment', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/orders', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Convert PO-NEXUS-881 to issued invoice
    const poRow = page.locator('.cf-table tbody tr').filter({ hasText: 'PO-NEXUS-881' });
    await poRow.locator('[aria-label^="Actions for"]').click();
    await page.locator('.cf-row-menu').getByRole('button', { name: /Convert to Invoice/i }).click();

    const convertDialog = page.locator('[role="dialog"]');
    await convertDialog.getByRole('button', { name: /Use verified example/i }).click();
    await convertDialog.getByRole('button', { name: /Review changes/i }).click();
    await convertDialog.getByRole('button', { name: /Continue to confirmation/i }).click();
    await convertDialog.getByRole('button', { name: /Confirm convert/i }).click();
    await convertDialog.getByRole('button', { name: /Return to workspace/i }).click();

    // Verify converted invoice mutated Dashboard: Total Invoiced increased to ₹8,26,000
    await navigateToScreen(page, 'Dashboard', 1440);
    await expect(page.locator('.cf-metric').filter({ hasText: 'Total invoiced' }).locator('strong')).toHaveText('₹8,26,000');
    await expect(page.locator('.cf-metric').filter({ hasText: 'Unbilled orders' }).locator('strong')).toHaveText('₹0');

    // Now Cancel INV-2026-045
    await navigateToScreen(page, 'Invoices', 1440);
    const invRow = page.locator('.cf-table tbody tr').filter({ hasText: 'INV-2026-045' });
    await invRow.locator('[aria-label^="Actions for"]').click();
    await page.locator('.cf-row-menu').getByRole('button', { name: /Cancel Invoice/i }).click();

    const cancelDialog = page.locator('[role="dialog"]');
    await cancelDialog.getByRole('button', { name: /Client rescinded contract/i }).click();
    await cancelDialog.getByRole('button', { name: /Review cancellation/i }).click();
    await cancelDialog.getByRole('button', { name: /Continue to confirmation/i }).click();
    await cancelDialog.getByRole('button', { name: /Confirm Cancellation/i }).click();
    await cancelDialog.getByRole('button', { name: /Return to workspace/i }).click();

    // Check Invoices DOM: Status is Cancelled, Balance is ₹0
    await expect(invRow).toContainText(/Cancelled/i);
    await expect(invRow).toContainText('₹0');

    // On Cancelled invoice, Record Payment must be disabled or absent
    await invRow.locator('[aria-label^="Actions for"]').click();
    const payOpt = page.locator('.cf-row-menu').getByRole('button', { name: /Record Payment/i });
    if (await payOpt.isVisible({ timeout: 1000 }).catch(() => false)) {
      const isDisabled = await payOpt.evaluate(el => (el as HTMLButtonElement).disabled);
      expect(isDisabled, 'Record Payment on CANCELLED invoice must be disabled').toBe(true);
    }
    await page.keyboard.press('Escape');

    // Check Dashboard DOM: Total Invoiced returns to ₹5,31,000 because cancelled invoice is excluded!
    await navigateToScreen(page, 'Dashboard', 1440);
    await expect(page.locator('.cf-metric').filter({ hasText: 'Total invoiced' }).locator('strong')).toHaveText('₹5,31,000');
    await expect(page.locator('.cf-metric').filter({ hasText: 'Total outstanding' }).locator('strong')).toHaveText('₹3,22,000');

    // Restore baseline
    await restoreBaseline(page);
    await assertAll7BaselineInvariants(page);
  });

  // ─── CHALLENGE 2: DEEP VERIFICATION OF ALL 7 BASELINE INVARIANTS ACROSS REGISTERS ───

  test('Invariant Challenge 2: Reset Demo restores all 7 financial invariants, AR aging, and register state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // Mutate state: convert order, record payment
    await navigateToScreen(page, 'Invoices', 1440);
    const inv042Row = page.locator('.cf-table tbody tr').filter({ hasText: 'INV-2026-042' });
    await inv042Row.locator('[aria-label^="Actions for"]').click();
    await page.locator('.cf-row-menu').getByRole('button', { name: /Record Payment/i }).click();
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByRole('button', { name: /Review changes/i }).click();
    await dialog.getByRole('button', { name: /Continue to confirmation/i }).click();
    await dialog.getByRole('button', { name: /Confirm payment/i }).click();
    await dialog.getByRole('button', { name: /Return to workspace/i }).click();

    // Trigger Reset Demo
    await restoreBaseline(page);

    // 1-7. Dashboard metrics
    await navigateToScreen(page, 'Dashboard', 1440);
    await assertAll7BaselineInvariants(page);

    // 8. AR Aging deep check: INV-2026-042 row has outstanding ₹3,22,000
    await navigateToScreen(page, 'AR Aging', 1440);
    const arRow = page.locator('.cf-table tbody tr').filter({ hasText: 'INV-2026-042' });
    await expect(arRow).toBeVisible();
    await expect(arRow.locator('.cf-balance strong')).toHaveText('₹3,22,000');

    // 9. Payments ledger count check
    await navigateToScreen(page, 'Payments', 1440);
    const paymentsCount = await page.locator('.cf-payments-table tbody tr').count();
    expect(paymentsCount, 'Baseline payments count must be exactly 1').toBe(1);

    // 10. Orders register check
    await navigateToScreen(page, 'Orders', 1440);
    const unbilledOrder = page.locator('.cf-table tbody tr').filter({ hasText: 'PO-NEXUS-881' });
    await expect(unbilledOrder).toBeVisible();
    await expect(unbilledOrder).toContainText(/Unbilled/i);
  });

  // ─── CHALLENGE 3: EDGE-CASE VIEWPORT INTEGRITY (320px NARROW MOBILE) ─────────

  test('Viewport Challenge 3A: 320px narrow mobile has ZERO horizontal overflow across all 8 routes', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const routes = [
      '/',
      '/#/orders', // test both or direct
      '/orders',
      '/invoices',
      '/payments',
      '/ar-aging',
      '/customers',
      '/settings',
      '/design-comparison',
    ];

    for (const route of routes) {
      if (route.includes('#')) continue;
      await page.goto(route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(100);

      const overflow = await page.evaluate(() => {
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });

      expect(
        overflow.hasOverflow,
        `Route ${route} at 320px has horizontal overflow (scrollWidth: ${overflow.scrollWidth}, clientWidth: ${overflow.clientWidth})`
      ).toBe(false);
    }
  });

  test('Viewport Challenge 3B: 320px narrow mobile drawers and modals remain contained without clipping or blowout', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/invoices', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Open Record Payment drawer from mobile cards at 320px
    const actionBtn = page.locator('.cf-mobile-cards [aria-label^="Actions for"]').first();
    await actionBtn.scrollIntoViewIfNeeded();
    await actionBtn.click();

    const recordPaymentBtn = page.locator('.cf-mobile-cards .cf-row-menu').getByRole('button', { name: /Record Payment/i });
    await expect(recordPaymentBtn).toBeVisible();
    await recordPaymentBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: 'visible' });

    // Drawer bounding box check
    const box = await dialog.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(320);
      expect(box.x).toBeGreaterThanOrEqual(0);
    }

    // Verify inputs fit and are operable
    const cashInput = dialog.locator('#pay-cash');
    await expect(cashInput).toBeVisible();
    await cashInput.fill('75000');

    // Check page horizontal overflow while drawer is open
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasOverflow, 'Page must not horizontally overflow while Record Payment drawer is open at 320px').toBe(false);

    // Close drawer
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  // ─── CHALLENGE 4: STRESS-TEST EXECUTION SPEED & FLAKINESS ────────────────────

  test('Stress Challenge 4: Consecutive mutating workflows in a single session without memory leak or state desynchronization', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/invoices', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Cycle 1: Mutate and reset
    for (let cycle = 1; cycle <= 3; cycle++) {
      const invRow = page.locator('.cf-table tbody tr').filter({ hasText: 'INV-2026-042' });
      await invRow.locator('[aria-label^="Actions for"]').click();
      await page.locator('.cf-row-menu').getByRole('button', { name: /Record Payment/i }).click();

      const dialog = page.locator('[role="dialog"]');
      await dialog.getByRole('button', { name: /Review changes/i }).click();
      await dialog.getByRole('button', { name: /Continue to confirmation/i }).click();
      await dialog.getByRole('button', { name: /Confirm payment/i }).click();
      await dialog.getByRole('button', { name: /Return to workspace/i }).click();
      await expect(dialog).not.toBeVisible();

      // Verify mutation took effect
      await expect(invRow).toContainText('₹2,22,000');

      // Reset
      await restoreBaseline(page);

      // Verify baseline restored
      await expect(invRow).toContainText('₹3,22,000');
    }

    // Verify dashboard invariant after 3 cycles
    await navigateToScreen(page, 'Dashboard', 1440);
    await assertAll7BaselineInvariants(page);
  });
});

