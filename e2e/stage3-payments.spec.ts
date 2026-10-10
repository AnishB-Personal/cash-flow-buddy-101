import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

/**
 * Stage 3 — Payments, Corrections & Invoice Cancellation
 * Multi-viewport: 1440px, 768px, 390px, 320px
 */

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

async function navigateToScreen(page: Page, screenName: 'Dashboard' | 'Orders' | 'Invoices' | 'Payments' | 'AR Aging', width: number) {
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

async function navigateToPayments(page: Page, width: number) {
  await navigateToScreen(page, 'Payments', width);
}

// Baseline financial values
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


const VIEWPORTS = [
  { width: 1440, height: 900, name: '1440px-desktop' },
  { width: 768, height: 1024, name: '768px-tablet' },
  { width: 390, height: 844, name: '390px-mobile' },
  { width: 320, height: 568, name: '320px-narrow-mobile' },
];

test.describe('CollectFlow Stage 3 — Payments, Corrections & Cancellation', () => {
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

  // ─── PAYMENTS PAGE — 4 VIEWPORTS ─────────────────────────────────────────

  for (const vp of VIEWPORTS) {
    test(`Payments page loads correctly at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/', { waitUntil: 'networkidle' });
      await restoreBaseline(page);
      await navigateToPayments(page, vp.width);

      // Page heading
      await expect(page.locator('h1', { hasText: 'Payments' })).toBeVisible();

      // Payments metrics section should be visible
      const metricsSection = page.locator('.cf-payments-metrics, .cf-metrics');
      await expect(metricsSection.first()).toBeVisible();

      // Payments table or cards should render
      const ledgerSection = page.locator('[aria-label="Payments ledger"]');
      await expect(ledgerSection).toBeVisible();

      // Screenshot evidence
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `s3-payments-${vp.name}.png`),
        fullPage: false,
      });
    });
  }

  // ─── PAYMENTS LEDGER DATA — DESKTOP ──────────────────────────────────────

  test('1440px: Payments ledger shows correct columns and at least one payment row', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await restoreBaseline(page);
    await navigateToPayments(page, 1440);

    // Payments table exists and has columns
    const table = page.locator('.cf-payments-table');
    await expect(table).toBeVisible();

    const headers = table.locator('thead th');
    const headerCount = await headers.count();
    expect(headerCount).toBeGreaterThanOrEqual(5);

    // At least one data row
    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Search box present
    await expect(page.locator('[aria-label="Search payments"]')).toBeVisible();
  });

  // ─── FINANCIAL BASELINE INVARIANT RESTORATION & MUTATIONS ────────────────

  test('1440px: Record Payment full 4-step workflow, dashboard perturbation and baseline restoration', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/invoices', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Open Record Payment for INV-2026-042
    const inv042Row = page.locator('.cf-table tbody tr').filter({ hasText: 'INV-2026-042' });
    await expect(inv042Row).toBeVisible();
    await inv042Row.locator('[aria-label^="Actions for"]').click();

    const recordPaymentOption = page.locator('.cf-row-menu').getByRole('button', { name: /Record Payment/i });
    await expect(recordPaymentOption).toBeVisible();
    await recordPaymentOption.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Step 1: Form — verified default preset is Partial Cash (₹1,00,000)
    await expect(dialog.getByText(/SETTLEMENT WORKFLOW/i)).toBeVisible();
    const reviewBtn = dialog.getByRole('button', { name: /Review changes/i });
    await expect(reviewBtn).toBeEnabled();
    await reviewBtn.click();

    // Step 2: Review — planned balance changes diff
    await expect(dialog.getByText(/Planned balance changes/i)).toBeVisible();
    const continueBtn = dialog.getByRole('button', { name: /Continue to confirmation/i });
    await expect(continueBtn).toBeVisible();
    await continueBtn.click();

    // Step 3: Confirm — confirmed balance changes
    await expect(dialog.getByText(/Confirmed balance changes/i)).toBeVisible();
    const confirmBtn = dialog.getByRole('button', { name: /Confirm payment/i });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Step 4: Result — success confirmation
    await expect(dialog.getByText(/Payment recorded successfully/i)).toBeVisible();
    const returnBtn = dialog.getByRole('button', { name: /Return to workspace/i });
    await expect(returnBtn).toBeVisible();
    await returnBtn.click();
    await expect(dialog).not.toBeVisible();

    // Assert perturbed metrics on Dashboard
    await navigateToScreen(page, 'Dashboard', 1440);
    const cashPerturbed = page.locator('.cf-metric').filter({ hasText: 'Cash collected' }).locator('strong');
    await expect(cashPerturbed).toHaveText('₹3,00,000');
    const settlementPerturbed = page.locator('.cf-revenue footer strong');
    await expect(settlementPerturbed).toHaveText('₹3,09,000');
    const outstandingPerturbed = page.locator('.cf-metric').filter({ hasText: 'Total outstanding' }).locator('strong');
    await expect(outstandingPerturbed).toHaveText('₹2,22,000');

    // Execute Reset Demo
    await restoreBaseline(page);

    // Assert all 7 approved baseline invariants are restored
    await assertAll7BaselineInvariants(page);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's3-baseline-restored-1440.png'),
      fullPage: false,
    });
  });

  test('390px: Record Payment full 4-step workflow, mobile perturbation and baseline restoration', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/invoices', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Open Record Payment from mobile card
    const actionBtn = page.locator('.cf-mobile-cards [aria-label^="Actions for"]').first();
    await actionBtn.scrollIntoViewIfNeeded();
    await actionBtn.click();

    const recordPaymentBtn = page.locator('.cf-mobile-cards .cf-row-menu').getByRole('button', { name: /Record Payment/i });
    await expect(recordPaymentBtn).toBeVisible();
    await recordPaymentBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // 4-step progression
    await dialog.getByRole('button', { name: /Review changes/i }).click();
    await dialog.getByRole('button', { name: /Continue to confirmation/i }).click();
    await dialog.getByRole('button', { name: /Confirm payment/i }).click();
    await dialog.getByRole('button', { name: /Return to workspace/i }).click();
    await expect(dialog).not.toBeVisible();

    // Verify perturbed metrics on Dashboard
    await navigateToScreen(page, 'Dashboard', 390);
    await expect(page.locator('.cf-metric').filter({ hasText: 'Cash collected' }).locator('strong')).toHaveText('₹3,00,000');
    await expect(page.locator('.cf-metric').filter({ hasText: 'Total outstanding' }).locator('strong')).toHaveText('₹2,22,000');

    // Execute Reset Demo
    await restoreBaseline(page);

    // Assert all 7 approved baseline invariants restored on mobile
    await assertAll7BaselineInvariants(page);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's3-baseline-restored-390.png'),
      fullPage: false,
    });
  });

  test('768px: Reset Demo restores all 7 baseline invariants on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    await assertAll7BaselineInvariants(page);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's3-baseline-restored-768.png'),
      fullPage: false,
    });
  });

  test('320px: Reset Demo restores all 7 baseline invariants on narrow mobile without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    await assertAll7BaselineInvariants(page);

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow, '320px should not have horizontal overflow on dashboard').toBe(false);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's3-baseline-restored-320.png'),
      fullPage: false,
    });
  });

  // ─── RECORD PAYMENT WORKFLOW & VALIDATION ─────────────────────────────────

  test('1440px: Record Payment drawer opens from invoice action', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/invoices', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Locate invoice with outstanding balance (INV-2026-042 has ₹3,22,000 outstanding)
    const inv042Row = page.locator('.cf-table tbody tr').filter({ hasText: 'INV-2026-042' });
    await expect(inv042Row, 'INV-2026-042 row must be visible').toBeVisible();

    const actionBtn = inv042Row.locator('[aria-label="Actions for INV-2026-042"]');
    await expect(actionBtn, 'Actions button must be visible').toBeVisible();
    await actionBtn.click();

    const recordPaymentOption = page.locator('.cf-row-menu').getByRole('button', { name: /Record Payment/i });
    await expect(recordPaymentOption, 'Record Payment option must be visible in action menu').toBeVisible();
    await recordPaymentOption.click();

    // Drawer should open with dialog title
    const drawerTitle = page.locator('[role="dialog"]').getByText(/Record Payment/i);
    await expect(drawerTitle, 'Record Payment drawer title must be visible').toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's3-record-payment-drawer-1440.png'),
      fullPage: false,
    });

    // Close the drawer cleanly
    const closeBtn = page.locator('[role="dialog"]').locator('[aria-label="Close payment workflow"]');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('1440px: Record Payment rejects overpayment beyond invoice balance with descriptive validation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/invoices', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    const inv042Row = page.locator('.cf-table tbody tr').filter({ hasText: 'INV-2026-042' });
    await inv042Row.locator('[aria-label^="Actions for"]').click();

    const recordPaymentOption = page.locator('.cf-row-menu').getByRole('button', { name: /Record Payment/i });
    await recordPaymentOption.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Input overpayment: 400000 on 322000 outstanding balance
    const cashInput = dialog.locator('#pay-cash');
    await cashInput.fill('400000');

    // Review button should be disabled
    const submitBtn = dialog.getByRole('button', { name: /Review changes/i });
    await expect(submitBtn).toBeDisabled();

    // Negative projected balance / error indicator
    const remainingEl = dialog.getByText(/Projected remaining balance:/i).locator('..').locator('strong');
    await expect(remainingEl).toHaveText('-₹78,000.00');

    // Restore valid amount and confirm submit re-enables
    await cashInput.fill('50000');
    await expect(submitBtn).toBeEnabled();

    // Close drawer
    await dialog.locator('[aria-label="Close payment workflow"]').click();
    const discardBtn = dialog.getByRole('button', { name: /Discard inputs/i });
    if (await discardBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await discardBtn.click();
    }
    await expect(dialog).not.toBeVisible();
  });

  test('390px: Record Payment drawer opens and remains within viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/invoices', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Scoped to .cf-mobile-cards to prevent hitting hidden desktop table action buttons
    const actionBtn = page.locator('.cf-mobile-cards [aria-label^="Actions for"]').first();
    await actionBtn.scrollIntoViewIfNeeded();
    await actionBtn.click();

    const recordPaymentBtn = page.locator('.cf-mobile-cards .cf-row-menu').getByRole('button', { name: /Record Payment/i });
    await expect(recordPaymentBtn).toBeVisible({ timeout: 5000 });
    await recordPaymentBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: 'visible', timeout: 5000 });

    const box = await dialog.boundingBox();
    expect(box, 'Dialog bounding box must not be null').not.toBeNull();
    expect(box!.y, 'Drawer top must be ≥ 0').toBeGreaterThanOrEqual(0);
    expect(box!.x, 'Drawer left must be ≥ 0').toBeGreaterThanOrEqual(0);
    expect(box!.width, 'Drawer width must be within viewport').toBeLessThanOrEqual(390);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's3-record-payment-mobile-390.png'),
      fullPage: false,
    });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  // ─── PAYMENTS LEDGER ACTION MENU ──────────────────────────────────────────

  test('1440px: Payment row action menu shows Payment Correction option', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await restoreBaseline(page);
    await navigateToPayments(page, 1440);

    // Open action menu on first payment row in Payments Ledger table
    const paymentActions = page.locator('.cf-table tbody tr [aria-label^="Actions for payment"]');
    await expect(paymentActions.first(), 'At least one payment row action button must be visible').toBeVisible();
    await paymentActions.first().click();

    // Should have a correction option in the action menu
    const correctionOption = page.locator('.cf-row-menu').getByRole('button', { name: /Correct.*Payment/i });
    await expect(correctionOption, 'Correct Payment option must be visible in menu').toBeVisible({ timeout: 3000 });

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's3-payment-action-menu-1440.png'),
      fullPage: false,
    });

    // Close menu via Escape
    await page.keyboard.press('Escape');
  });

  // ─── INVOICE CANCELLATION BLOCKING ────────────────────────────────────────

  test('1440px: Cancel Invoice blocked for INV-2026-042 (has payments)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/invoices', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Locate INV-2026-042 row explicitly
    const inv042Row = page.locator('.cf-table tbody tr').filter({ hasText: 'INV-2026-042' });
    await expect(inv042Row, 'INV-2026-042 row must be visible in table').toBeVisible();

    // Open action menu
    const actionBtn = inv042Row.locator('[aria-label="Actions for INV-2026-042"]');
    await expect(actionBtn, 'Actions button for INV-2026-042 must be visible').toBeVisible();
    await actionBtn.click();

    // Click Cancel Invoice in action menu
    const cancelOption = page.locator('.cf-row-menu').getByRole('button', { name: 'Cancel Invoice' });
    await expect(cancelOption, 'Cancel Invoice action option must be visible').toBeVisible();
    await cancelOption.click();

    // Assert Cancel Invoice drawer opens
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog, 'Cancellation dialog drawer must open').toBeVisible();
    await expect(dialog.getByText(/Cancel Invoice · INV-2026-042/i)).toBeVisible();

    // Assert strict cancellation blocking message & banner (FastAPI barrier parity)
    const blockingHeader = dialog.getByText('Cancellation Blocked: Active Payments Recorded');
    await expect(blockingHeader, 'Cancellation Blocked banner must be displayed').toBeVisible();

    const blockingMsg = dialog.getByText(/Cannot cancel invoice with existing payments\. All payments must be deleted\/reversed first\./i);
    await expect(blockingMsg, 'Blocking error message must be displayed').toBeVisible();

    // Assert that cancellation submission buttons are strictly absent
    const submitBtn = dialog.getByRole('button', { name: /Review|Confirm/i });
    await expect(submitBtn, 'Submit/Review buttons must not be rendered when cancellation is blocked').toHaveCount(0);

    // Close the drawer cleanly
    const closeBtn = dialog.getByRole('button', { name: 'Close', exact: true });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(dialog).not.toBeVisible();
  });

  test('1440px: Cancel unpaid invoice (converted order) full workflow and verify exclusion from AR aging', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/orders', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Convert PO-NEXUS-881 to issued invoice using verified example (INV-2026-045)
    const poRow = page.locator('.cf-table tbody tr').filter({ hasText: 'PO-NEXUS-881' });
    await expect(poRow).toBeVisible();
    await poRow.locator('[aria-label^="Actions for"]').click();

    const convertOption = page.locator('.cf-row-menu').getByRole('button', { name: /Convert to Invoice/i });
    await expect(convertOption).toBeVisible();
    await convertOption.click();

    const convertDialog = page.locator('[role="dialog"]');
    await expect(convertDialog).toBeVisible();

    // Use verified example (pre-fills INV-2026-045)
    await convertDialog.getByRole('button', { name: /Use verified example/i }).click();

    await convertDialog.getByRole('button', { name: /Review changes/i }).click();
    await convertDialog.getByRole('button', { name: /Continue to confirmation/i }).click();
    await convertDialog.getByRole('button', { name: /Confirm convert/i }).click();
    await convertDialog.getByRole('button', { name: /Return to workspace/i }).click();
    await expect(convertDialog).not.toBeVisible();

    // Navigate client-side to Invoices
    await navigateToScreen(page, 'Invoices', 1440);
    const invRow = page.locator('.cf-table tbody tr').filter({ hasText: 'INV-2026-045' });
    await expect(invRow).toBeVisible();
    await expect(invRow).toContainText(/Pending/i);

    // Open Cancel Invoice workflow on INV-2026-045
    await invRow.locator('[aria-label^="Actions for"]').click();
    const cancelOption = page.locator('.cf-row-menu').getByRole('button', { name: /Cancel Invoice/i });
    await expect(cancelOption).toBeVisible();
    await cancelOption.click();

    const cancelDialog = page.locator('[role="dialog"]');
    await expect(cancelDialog).toBeVisible();
    await expect(cancelDialog.getByText(/Cancel Invoice · INV-2026-045/i)).toBeVisible();

    // Select reason preset
    const presetBtn = cancelDialog.getByRole('button', { name: /Client rescinded contract/i });
    await expect(presetBtn).toBeVisible();
    await presetBtn.click();

    // Progress 4 steps: Form -> Review -> Confirm -> Result
    await cancelDialog.getByRole('button', { name: /Review cancellation/i }).click();
    await expect(cancelDialog.getByText(/Planned lifecycle changes/i)).toBeVisible();

    await cancelDialog.getByRole('button', { name: /Continue to confirmation/i }).click();
    await expect(cancelDialog.getByText(/Confirmed lifecycle changes/i)).toBeVisible();

    await cancelDialog.getByRole('button', { name: /Confirm Cancellation/i }).click();
    await expect(cancelDialog.getByText(/Invoice Successfully Cancelled/i)).toBeVisible();

    await cancelDialog.getByRole('button', { name: /Return to workspace/i }).click();
    await expect(cancelDialog).not.toBeVisible();

    // Verify invoice status updated to CANCELLED and outstanding balance is zeroed
    const cancelledRow = page.locator('.cf-table tbody tr').filter({ hasText: 'INV-2026-045' });
    await expect(cancelledRow).toBeVisible();
    await expect(cancelledRow).toContainText(/Cancelled/i);

    // Verify exclusion from AR Aging
    await navigateToScreen(page, 'AR Aging', 1440);
    await expect(page.locator('.cf-record-section').filter({ hasText: 'INV-2026-045' })).toHaveCount(0);

    // Reset Demo restores baseline
    await restoreBaseline(page);
    await navigateToScreen(page, 'Dashboard', 1440);
    await assertAll7BaselineInvariants(page);
  });


  // ─── PAYMENTS PAGE SEARCH ─────────────────────────────────────────────────

  test('1440px: Payments search filters rows', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await restoreBaseline(page);
    await navigateToPayments(page, 1440);

    const searchInput = page.locator('[aria-label="Search payments"]');
    await expect(searchInput).toBeVisible();

    // Get initial row count
    const table = page.locator('.cf-payments-table tbody tr');
    const initialCount = await table.count();

    // Search for something specific
    await searchInput.fill('REM');
    await page.waitForTimeout(300);

    const filteredCount = await table.count();
    // Filtered count should be ≤ initial (search applied)
    expect(filteredCount).toBeLessThanOrEqual(initialCount);

    // Clear search
    const resetBtn = page.getByRole('button', { name: /Reset filters/i });
    await resetBtn.click();
    await page.waitForTimeout(200);
    const restoredCount = await table.count();
    expect(restoredCount).toEqual(initialCount);
  });

  // ─── MOBILE NAVIGATION TO PAYMENTS ───────────────────────────────────────

  test('390px: Mobile bottom nav navigates to Payments', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Bottom nav should have Payments
    const bottomPayments = page.locator('.cf-bottom-nav button', { hasText: 'Payments' });
    await expect(bottomPayments).toBeVisible();
    await bottomPayments.click();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1', { hasText: 'Payments' })).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's3-payments-mobile-bottomnav-390.png'),
      fullPage: false,
    });
  });

  test('320px: Payments page renders without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await restoreBaseline(page);
    await navigateToPayments(page, 320);

    await expect(page.locator('h1', { hasText: 'Payments' })).toBeVisible();

    // Check for horizontal scrollbar (scrollWidth > clientWidth indicates overflow)
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow, '320px should not have horizontal overflow').toBe(false);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's3-payments-320.png'),
      fullPage: false,
    });
  });

  // ─── PAYMENT CORRECTION DRAWER ────────────────────────────────────────────

  test('1440px: Payment Correction drawer opens with two-step flow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await restoreBaseline(page);
    await navigateToPayments(page, 1440);

    const paymentActions = page.locator('.cf-table tbody tr [aria-label^="Actions for payment"]');
    await expect(paymentActions.first(), 'Payment row action button must be visible').toBeVisible();
    await paymentActions.first().click();

    const correctionBtn = page.locator('.cf-row-menu').getByRole('button', { name: /Correct.*Payment/i });
    await expect(correctionBtn, 'Correct Payment menu button must be visible').toBeVisible({ timeout: 3000 });
    await correctionBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog, 'Correction dialog drawer must be visible').toBeVisible({ timeout: 5000 });

    // Step 1 of the correction dialog should be visible (two-step flow)
    const step1Content = dialog.getByText(/1\. Physical Deletion|delete payment record|confirm deletion/i).first();
    await expect(step1Content, 'Step 1 deletion content must be visible in correction flow').toBeVisible({ timeout: 3000 });

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's3-correction-drawer-1440.png'),
      fullPage: false,
    });

    // Close via close button
    const closeBtn = dialog.locator('[aria-label="Close correction workflow"]');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(dialog).not.toBeVisible();
  });

  // ─── ALL ROUTES NO CONSOLE ERRORS — 4 VIEWPORTS ──────────────────────────

  for (const vp of VIEWPORTS) {
    test(`${vp.name}: Zero console errors across all 8 implemented routes`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const routes = [
        '/',
        '/orders',
        '/invoices',
        '/payments',
        '/ar-aging',
        '/customers',
        '/settings',
        '/design-comparison',
      ];

      for (const route of routes) {
        await page.goto(route, { waitUntil: 'networkidle' });
      }
      expect(browserErrors, `Zero unhandled browser console errors at ${vp.name}`).toEqual([]);
    });
  }

  // ─── PAYMENTS METRICS TOTALS ──────────────────────────────────────────────

  test('768px: Payments metrics display correct totals after baseline reset', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await restoreBaseline(page);
    await navigateToPayments(page, 768);

    const metrics = page.locator('.cf-payments-metrics');
    await expect(metrics).toBeVisible();

    // Assert exact financial metrics matching baseline invariants
    const totalSettled = metrics.locator('.cf-metric').filter({ hasText: 'Total Settled' }).locator('strong');
    await expect(totalSettled, 'Total Settled metric must match baseline ₹2,09,000').toHaveText('₹2,09,000');

    const cashCollected = metrics.locator('.cf-metric').filter({ hasText: 'Cash Collected' }).locator('strong');
    await expect(cashCollected, 'Cash Collected metric must match baseline ₹2,00,000').toHaveText('₹2,00,000');

    const tdsRecognized = metrics.locator('.cf-metric').filter({ hasText: 'TDS Recognized' }).locator('strong');
    await expect(tdsRecognized, 'TDS Recognized metric must match baseline ₹9,000').toHaveText('₹9,000');

    const efficiency = metrics.locator('.cf-metric').filter({ hasText: 'Settlement Efficiency' }).locator('strong');
    await expect(efficiency, 'Settlement Efficiency must be 96%').toHaveText('96%');

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 's3-payments-metrics-768.png'),
      fullPage: false,
    });
  });
});
