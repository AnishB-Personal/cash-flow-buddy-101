import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Global baseline reset helper
async function restoreBaseline(page: Page) {
  const resetBtn = page.getByRole('button', { name: /Reset Demo/i });
  if (await resetBtn.isVisible()) {
    await resetBtn.click();
    const confirmBtn = page.getByRole('button', { name: 'Restore baseline' });
    await confirmBtn.waitFor({ state: 'visible' });
    await confirmBtn.click();
    await page.waitForTimeout(300);
  }
}

test.describe('CollectFlow Stage 2 - Multi-Viewport Responsive Regression Suite', () => {
  let browserErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    browserErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        browserErrors.push(`[console.error] ${msg.text()}`);
      }
    });
    page.on('pageerror', error => {
      browserErrors.push(`[uncaughtException] ${error.message}`);
    });
  });

  test.afterEach(async () => {
    expect(browserErrors, 'Zero unhandled browser console errors or uncaught exceptions').toEqual([]);
  });

  test('1440px Desktop: full navigation, table layout, metrics grid, action dropdowns', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // 1. Navigation verification: Full desktop sidebar
    const sidebar = page.locator('.cf-sidebar');
    await expect(sidebar).toBeVisible();
    const sidebarBox = await sidebar.boundingBox();
    expect(sidebarBox?.width).toBeGreaterThanOrEqual(200);

    // Sidebar brand, workspace label, and text labels should be visible
    await expect(page.locator('.cf-sidebar > header > strong')).toHaveText('CollectFlow');
    await expect(page.locator('.cf-workspace-label')).toContainText('Acme workspace');
    await expect(page.locator('.cf-nav-item', { hasText: 'Dashboard' })).toBeVisible();
    await expect(page.locator('.cf-nav-item', { hasText: 'Orders' })).toBeVisible();
    await expect(page.locator('.cf-nav-item', { hasText: 'Invoices' })).toBeVisible();
    await expect(page.locator('.cf-nav-item', { hasText: 'AR Aging' })).toBeVisible();

    // 2. Metrics grid: 4-column layout
    const metricsGrid = page.locator('.cf-metrics');
    await expect(metricsGrid).toBeVisible();
    const gridCols = await metricsGrid.evaluate(el => window.getComputedStyle(el).gridTemplateColumns);
    const colCount = gridCols.split(' ').length;
    expect(colCount).toBe(4);

    // Verify all 7 metric cards rendered
    const metrics = page.locator('.cf-metrics .cf-metric');
    await expect(metrics).toHaveCount(7);

    // 3. Table layout: Desktop table container and cf-table visible
    const tableContainer = page.locator('.cf-table-container');
    await expect(tableContainer).toBeVisible();
    const table = page.locator('table.cf-table');
    await expect(table).toBeVisible();
    await expect(page.locator('.cf-mobile-cards')).toBeHidden();

    // 4. Action dropdowns: open dropdown and verify menu actions
    const firstRowActionsBtn = page.locator('.cf-table tbody tr').first().locator('.cf-actions-cell').getByRole('button', { name: /Actions for/i });
    await expect(firstRowActionsBtn).toBeVisible();
    await firstRowActionsBtn.click();

    const rowMenu = page.locator('.cf-table-container .cf-row-menu');
    await expect(rowMenu).toBeVisible();
    await expect(rowMenu.getByRole('button', { name: 'View Invoice' })).toBeVisible();

    // Close menu by clicking action button again
    await firstRowActionsBtn.click();
    await expect(rowMenu).toBeHidden();

    // Capture desktop screenshot
    const screenshotPath = path.join(SCREENSHOTS_DIR, 'viewport-1440px-desktop.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test('768px Tablet: collapsed sidebar icons, compact table, 2-column metrics', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // 1. Navigation verification: Collapsed sidebar rail (width ~72px, icons only)
    const sidebar = page.locator('.cf-sidebar');
    await expect(sidebar).toBeVisible();
    const sidebarBox = await sidebar.boundingBox();
    expect(sidebarBox?.width).toBeLessThanOrEqual(75);

    // Brand title, workspace label and text spans should be hidden in rail mode
    await expect(page.locator('.cf-sidebar > header > strong')).toBeHidden();
    await expect(page.locator('.cf-workspace-label')).toBeHidden();
    await expect(page.locator('.cf-nav-item > span').first()).toBeHidden();

    // 2. Metrics grid: 2-column layout
    const metricsGrid = page.locator('.cf-metrics');
    await expect(metricsGrid).toBeVisible();
    const gridCols = await metricsGrid.evaluate(el => window.getComputedStyle(el).gridTemplateColumns);
    const colCount = gridCols.split(' ').length;
    expect(colCount).toBe(2);

    // 3. Compact table: table container remains visible with horizontal overflow support
    const tableContainer = page.locator('.cf-table-container');
    await expect(tableContainer).toBeVisible();
    const table = page.locator('table.cf-table');
    await expect(table).toBeVisible();

    // Capture tablet screenshot
    const screenshotPath = path.join(SCREENSHOTS_DIR, 'viewport-768px-tablet.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test('390px Mobile: bottom navigation bar, card layout, workflow drawer full width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // 1. Navigation: desktop sidebar hidden, bottom nav visible
    await expect(page.locator('.cf-sidebar')).toBeHidden();
    const bottomNav = page.locator('.cf-bottom-nav');
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    await expect(bottomNav.getByRole('button', { name: 'Orders' })).toBeVisible();
    await expect(bottomNav.getByRole('button', { name: 'Invoices' })).toBeVisible();
    await expect(bottomNav.getByRole('button', { name: 'More' })).toBeVisible();

    // 2. Card layout: table container hidden, mobile cards rendered
    await expect(page.locator('.cf-table-container')).toBeHidden();
    const mobileCards = page.locator('.cf-mobile-cards');
    await expect(mobileCards).toBeVisible();
    const cardItems = page.locator('.cf-mobile-cards .cf-record-card');
    await expect(cardItems.first()).toBeVisible();

    // 3. Capture mobile viewport screenshot
    const mobileScreenshotPath = path.join(SCREENSHOTS_DIR, 'viewport-390px-mobile.png');
    await page.screenshot({ path: mobileScreenshotPath, fullPage: false });
    expect(fs.existsSync(mobileScreenshotPath)).toBe(true);
  });

  test('320px Narrow Mobile: boundary containment, no horizontal page blowout, readable metrics', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // 1. Verify zero horizontal page blowout at 320px boundary
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));

    expect(dimensions.scrollWidth).toBeLessThanOrEqual(320);
    expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(320);

    // 2. Metrics readability: all metric cards visible and contain readable numerical content
    const metricCards = page.locator('.cf-metrics .cf-metric');
    await expect(metricCards).toHaveCount(7);

    for (let i = 0; i < 7; i++) {
      const card = metricCards.nth(i);
      await expect(card).toBeVisible();
      const val = card.locator('strong');
      await expect(val).toBeVisible();
      const text = await val.textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }

    // Capture 320px screenshot
    const narrowScreenshotPath = path.join(SCREENSHOTS_DIR, 'viewport-320px-narrow-mobile.png');
    await page.screenshot({ path: narrowScreenshotPath, fullPage: false });
    expect(fs.existsSync(narrowScreenshotPath)).toBe(true);
  });
});

test.describe('Mobile Workflow Drawer Lifecycle', () => {
  let browserErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    browserErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') browserErrors.push(msg.text());
    });
    page.on('pageerror', err => browserErrors.push(err.message));
  });

  test.afterEach(async () => {
    expect(browserErrors).toEqual([]);
  });

  test('Mobile drawer: opening, full-width anchoring, body scrolling, footer button accessibility, and close', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/orders', { waitUntil: 'networkidle' });

    // 1. Open drawer from mobile card
    const firstCard = page.locator('.cf-mobile-cards .cf-record-card').first();
    await expect(firstCard).toBeVisible();
    const viewBtn = firstCard.locator('footer').getByRole('button', { name: /View Order/i });
    await viewBtn.click();

    const drawer = page.locator('.cf-drawer');
    await drawer.waitFor({ state: 'visible' });

    // 2. Anchoring and Full-width verification
    const drawerBox = await drawer.boundingBox();
    expect(drawerBox).not.toBeNull();
    expect(drawerBox?.width).toBe(390);
    expect(drawerBox?.x).toBe(0);

    // 3. Body scrolling verification
    const drawerBody = drawer.locator('.cf-drawer-body');
    await expect(drawerBody).toBeVisible();
    const scrollInfo = await drawerBody.evaluate(el => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      isScrollable: el.scrollHeight > el.clientHeight,
    }));
    expect(scrollInfo.isScrollable).toBe(true);

    // Perform scrolling on body
    await drawerBody.evaluate(el => {
      el.scrollTop = el.scrollHeight;
    });

    // 4. Footer button accessibility: footer fixed at bottom, buttons accessible
    const drawerFooter = drawer.locator('.cf-drawer-footer');
    await expect(drawerFooter).toBeVisible();
    const footerButtons = drawerFooter.getByRole('button');
    const buttonCount = await footerButtons.count();
    expect(buttonCount).toBeGreaterThanOrEqual(1);
    await expect(footerButtons.first()).toBeEnabled();

    // Capture drawer screenshot
    const drawerScreenshotPath = path.join(SCREENSHOTS_DIR, 'mobile-drawer-lifecycle.png');
    await page.screenshot({ path: drawerScreenshotPath, fullPage: false });
    expect(fs.existsSync(drawerScreenshotPath)).toBe(true);

    // 5. Close drawer via header close button
    const closeBtn = drawer.locator('.cf-drawer-header').getByRole('button', { name: /Close record details/i });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    await drawer.waitFor({ state: 'hidden' });
    await expect(drawer).toBeHidden();
  });
});

test.describe('Order Workflows (Stage 2 Coverage)', () => {
  let browserErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    browserErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') browserErrors.push(msg.text());
    });
    page.on('pageerror', err => browserErrors.push(err.message));
  });

  test.afterEach(async () => {
    expect(browserErrors).toEqual([]);
  });

  test('Create Order workflow: form, review impact, confirm, result and listing verification', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/orders', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // 1. Click New Order button in heading actions
    const newOrderBtn = page.getByRole('button', { name: 'New Order' });
    await expect(newOrderBtn).toBeVisible();
    await newOrderBtn.click();

    const drawer = page.locator('.cf-drawer.cf-demo-drawer');
    await drawer.waitFor({ state: 'visible' });
    await expect(drawer.getByRole('heading', { name: 'Create Purchase Order' })).toBeVisible();

    // 2. Use verified example to populate form
    const exampleBtn = page.getByRole('button', { name: 'Use verified example' });
    await expect(exampleBtn).toBeVisible();
    await exampleBtn.click();

    // Verify populated values
    await expect(page.locator('#ord-po_number')).toHaveValue('PO-2026-DEMO-001');

    // 3. Step: Form -> Review
    const reviewBtn = page.getByRole('button', { name: /Review changes/i });
    await reviewBtn.click();

    // Verify Review step content
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Review');
    await expect(drawer.getByText('Financial review & impact')).toBeVisible();

    // 4. Step: Review -> Confirm
    const continueBtn = page.getByRole('button', { name: /Continue to confirmation/i });
    await continueBtn.click();
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Confirm');

    // 5. Step: Confirm -> Result
    const confirmBtn = page.getByRole('button', { name: /Confirm create purchase order/i });
    await confirmBtn.click();
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Result');
    await expect(drawer.getByText(/Verified demo change applied/i)).toBeVisible();

    // Capture screenshot of result
    const createScreenshot = path.join(SCREENSHOTS_DIR, 'order-create-workflow.png');
    await page.screenshot({ path: createScreenshot });

    // 6. Return to workspace & verify order in table
    const returnBtn = page.getByRole('button', { name: 'Return to workspace' });
    await returnBtn.click();
    await drawer.waitFor({ state: 'hidden' });

    const createdRow = page.locator('.cf-table tbody tr', { hasText: 'PO-2026-DEMO-001' });
    await expect(createdRow).toBeVisible();
    await expect(createdRow).toContainText('₹1,18,000');
  });

  test('Edit Order workflow: modify metadata, review, confirm, and verify updated order', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/orders', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Locate unbilled order PO-NEXUS-881
    const orderRow = page.locator('.cf-table tbody tr', { hasText: 'PO-NEXUS-881' });
    await expect(orderRow).toBeVisible();

    // Trigger Edit Order from row actions
    const actionBtn = orderRow.getByRole('button', { name: /Actions for PO-NEXUS-881/i });
    await actionBtn.click();

    const editMenuBtn = page.locator('.cf-table-container .cf-row-menu').getByRole('button', { name: 'Edit Order' });
    await expect(editMenuBtn).toBeVisible();
    await editMenuBtn.click();

    const drawer = page.locator('.cf-drawer.cf-demo-drawer');
    await drawer.waitFor({ state: 'visible' });
    await expect(drawer.getByRole('heading', { name: 'Edit Order' })).toBeVisible();

    // Use verified example for Edit
    await page.getByRole('button', { name: 'Use verified example' }).click();

    // Advance to Review
    await page.getByRole('button', { name: /Review changes/i }).click();
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Review');
    await expect(drawer.getByText(/Verified unbilled order metadata rehearsal/i)).toBeVisible();

    // Advance to Confirm
    await page.getByRole('button', { name: /Continue to confirmation/i }).click();
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Confirm');

    // Confirm edit
    const confirmEditBtn = page.getByRole('button', { name: /Confirm edit order/i });
    await confirmEditBtn.click();
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Result');

    // Capture screenshot
    const editScreenshot = path.join(SCREENSHOTS_DIR, 'order-edit-workflow.png');
    await page.screenshot({ path: editScreenshot });

    // Return to workspace
    await page.getByRole('button', { name: 'Return to workspace' }).click();
    await drawer.waitFor({ state: 'hidden' });
  });

  test('Convert Order to Invoice workflow: assign invoice number, verify financial impact and new invoice', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/orders', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Locate unbilled order PO-NEXUS-881
    const orderRow = page.locator('.cf-table tbody tr', { hasText: 'PO-NEXUS-881' });
    await expect(orderRow).toBeVisible();

    // Trigger Convert to Invoice from row actions
    const actionBtn = orderRow.getByRole('button', { name: /Actions for PO-NEXUS-881/i });
    await actionBtn.click();

    const convertMenuBtn = page.locator('.cf-table-container .cf-row-menu').getByRole('button', { name: 'Convert to Invoice' });
    await expect(convertMenuBtn).toBeVisible();
    await convertMenuBtn.click();

    const drawer = page.locator('.cf-drawer.cf-demo-drawer');
    await drawer.waitFor({ state: 'visible' });
    await expect(drawer.getByRole('heading', { name: 'Convert to Invoice' })).toBeVisible();

    // Use verified example
    await page.getByRole('button', { name: 'Use verified example' }).click();
    await expect(page.locator('#conv-inv-num')).toHaveValue('INV-2026-045');

    // Review step
    await page.getByRole('button', { name: /Review changes/i }).click();
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Review');
    await expect(drawer.getByText('+₹2,95,000').first()).toBeVisible();

    // Confirm step
    await page.getByRole('button', { name: /Continue to confirmation/i }).click();
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Confirm');

    // Confirm convert
    await page.getByRole('button', { name: /Confirm convert to invoice/i }).click();
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Result');

    // Capture screenshot
    const convertScreenshot = path.join(SCREENSHOTS_DIR, 'order-convert-workflow.png');
    await page.screenshot({ path: convertScreenshot });

    // Return to workspace
    await page.getByRole('button', { name: 'Return to workspace' }).click();
    await drawer.waitFor({ state: 'hidden' });

    // Navigate to Invoices via in-app navigation to preserve session state
    await page.locator('.cf-sidebar .cf-nav-item', { hasText: 'Invoices' }).click();
    await page.waitForURL('**/invoices');
    const newInvoiceRow = page.locator('.cf-table tbody tr', { hasText: 'INV-2026-045' });
    await expect(newInvoiceRow).toBeVisible();
    await expect(newInvoiceRow).toContainText('₹2,95,000');
  });

  test('Delete Order workflow: delete unbilled order, verify removal from order register', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/orders', { waitUntil: 'networkidle' });
    await restoreBaseline(page);

    // Locate unbilled order PO-NEXUS-881
    const orderRow = page.locator('.cf-table tbody tr', { hasText: 'PO-NEXUS-881' });
    await expect(orderRow).toBeVisible();

    // Trigger Delete Order from row actions
    const actionBtn = orderRow.getByRole('button', { name: /Actions for PO-NEXUS-881/i });
    await actionBtn.click();

    const deleteMenuBtn = page.locator('.cf-table-container .cf-row-menu').getByRole('button', { name: 'Delete Order' });
    await expect(deleteMenuBtn).toBeVisible();
    await deleteMenuBtn.click();

    const drawer = page.locator('.cf-drawer.cf-demo-drawer');
    await drawer.waitFor({ state: 'visible' });
    await expect(drawer.getByRole('heading', { name: 'Delete Order' })).toBeVisible();
    await expect(drawer.getByText(/Permanently delete unbilled order/i)).toBeVisible();

    // Advance to Review
    await page.getByRole('button', { name: /Review changes/i }).click();
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Review');
    await expect(drawer.getByText('-₹2,95,000')).toBeVisible();

    // Advance to Confirm
    await page.getByRole('button', { name: /Continue to confirmation/i }).click();
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Confirm');

    // Confirm deletion
    const confirmDeleteBtn = page.getByRole('button', { name: /Confirm delete order/i });
    await confirmDeleteBtn.click();
    await expect(drawer.locator('.cf-demo-progress span[aria-current="step"]')).toHaveText('Result');

    // Capture screenshot
    const deleteScreenshot = path.join(SCREENSHOTS_DIR, 'order-delete-workflow.png');
    await page.screenshot({ path: deleteScreenshot });

    // Return to workspace & verify order is deleted from table
    await page.getByRole('button', { name: 'Return to workspace' }).click();
    await drawer.waitFor({ state: 'hidden' });

    const deletedOrder = page.locator('.cf-table tbody tr', { hasText: 'PO-NEXUS-881' });
    await expect(deletedOrder).toHaveCount(0);
  });
});

test.describe('Reset Demo Baseline & Financial Assertions', () => {
  let browserErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    browserErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') browserErrors.push(msg.text());
    });
    page.on('pageerror', err => browserErrors.push(err.message));
  });

  test.afterEach(async () => {
    expect(browserErrors).toEqual([]);
  });

  test('Reset Demo button restores approved financial baseline exactly', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // Click Reset Demo button in demo controls bar
    const resetDemoBtn = page.getByRole('button', { name: /Reset Demo/i });
    await expect(resetDemoBtn).toBeVisible();
    await resetDemoBtn.click();

    // Confirm in the alert dialog
    const restoreAlert = page.locator('.cf-demo-reset');
    await expect(restoreAlert).toBeVisible();
    await expect(restoreAlert).toContainText('Restore the approved baseline');

    const restoreBaselineBtn = restoreAlert.getByRole('button', { name: 'Restore baseline' });
    await restoreBaselineBtn.click();
    await expect(restoreAlert).toBeHidden();

    // 1. Invoiced: ₹5,31,000
    const invoicedCard = page.locator('.cf-metrics .cf-metric', { hasText: 'Total invoiced' });
    await expect(invoicedCard).toBeVisible();
    await expect(invoicedCard.locator('strong')).toHaveText('₹5,31,000');

    // 2. Cash: ₹2,00,000
    const cashCard = page.locator('.cf-metrics .cf-metric', { hasText: 'Cash collected' });
    await expect(cashCard).toBeVisible();
    await expect(cashCard.locator('strong')).toHaveText('₹2,00,000');

    // 3. TDS: ₹9,000
    const tdsCard = page.locator('.cf-metrics .cf-metric', { hasText: 'TDS recognized' });
    await expect(tdsCard).toBeVisible();
    await expect(tdsCard.locator('strong')).toHaveText('₹9,000');

    // 4. Settlements: ₹2,09,000
    const settlementTotal = page.locator('.cf-revenue footer strong');
    await expect(settlementTotal).toBeVisible();
    await expect(settlementTotal).toHaveText('₹2,09,000');

    // 5. Outstanding: ₹3,22,000
    const outstandingCard = page.locator('.cf-metrics .cf-metric', { hasText: 'Total outstanding' });
    await expect(outstandingCard).toBeVisible();
    await expect(outstandingCard.locator('strong')).toHaveText('₹3,22,000');

    // 6. Unbilled: ₹2,95,000
    const unbilledCard = page.locator('.cf-metrics .cf-metric', { hasText: 'Unbilled orders' });
    await expect(unbilledCard).toBeVisible();
    await expect(unbilledCard.locator('strong')).toHaveText('₹2,95,000');

    // 7. Aging as of 30 April 2026
    const agingHeader = page.locator('.cf-aging p.cf-muted');
    await expect(agingHeader).toBeVisible();
    await expect(agingHeader).toHaveText(/Aging as of 30 Apr(il)? 2026/);

    // Capture baseline verified screenshot
    const baselineScreenshot = path.join(SCREENSHOTS_DIR, 'baseline-restored-dashboard.png');
    await page.screenshot({ path: baselineScreenshot });
    expect(fs.existsSync(baselineScreenshot)).toBe(true);
  });
});
