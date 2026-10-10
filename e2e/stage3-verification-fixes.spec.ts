import { test, expect, type Page } from '@playwright/test';

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

test.describe('Stage 3 Verification Fixes (CF3-01 through CF3-04)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await restoreBaseline(page);
  });

  test('CF3-02: Mobile preview drawer does not clip header or close button after phone frame is scrolled', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Navigate to Payments
    await page.locator('.cf-nav-item', { hasText: 'Payments' }).click();
    await expect(page.locator('h1')).toHaveText('Payments');

    // Switch to Mobile Preview
    const mobileBtn = page.locator('.cf-review-bar button[title="Mobile preview"]');
    await mobileBtn.click();
    await expect(page.locator('.cf-preview-mobile')).toBeVisible();

    const frame = page.locator('.cf-preview-mobile > .cf-frame');
    await expect(frame).toBeVisible();

    // Scroll down inside the phone shell
    await page.evaluate(() => {
      const shell = document.querySelector('.cf-preview-mobile .cf-shell');
      if (shell) shell.scrollTop = 150;
    });
    await page.waitForTimeout(200);

    // Open View Invoice / Payment drawer by clicking the first payment row card
    const firstCard = page.locator('.cf-record-card').first();
    await firstCard.locator('button', { hasText: /INV-2026-042/i }).click();

    // Drawer should open
    const drawer = page.locator('.cf-preview-mobile .cf-drawer');
    await expect(drawer).toBeVisible();

    // Measure bounding boxes
    const frameBox = await frame.boundingBox();
    const drawerBox = await drawer.boundingBox();
    expect(frameBox).not.toBeNull();
    expect(drawerBox).not.toBeNull();

    // Dialog top must NOT be negative relative to frame top (prevents y=-49 bug)
    expect(drawerBox!.y).toBeGreaterThanOrEqual(frameBox!.y - 2);
    expect(drawerBox!.y).toBeLessThanOrEqual(frameBox!.y + 10);

    // Close button must be strictly visible inside frame
    const closeBtn = drawer.locator('button[aria-label*="Close"]');
    await expect(closeBtn).toBeVisible();
    const closeBox = await closeBtn.boundingBox();
    expect(closeBox).not.toBeNull();
    expect(closeBox!.y).toBeGreaterThan(frameBox!.y);
    expect(closeBox!.y + closeBox!.height).toBeLessThan(frameBox!.y + frameBox!.height);

    // Verify drawer body scrollability
    const body = drawer.locator('.cf-drawer-body');
    const scrollInfo = await body.evaluate(el => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollInfo.scrollHeight).toBeGreaterThan(scrollInfo.clientHeight);

    // Close drawer and switch back to desktop preview
    await closeBtn.click();
    await expect(drawer).not.toBeVisible();
    await page.locator('.cf-review-bar button[title="Desktop preview"]').click();
  });

  test('CF3-01: Payment correction review accounts for surviving invoice payments', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Step 1: Select Admin role
    const roleSelector = page.locator('.cf-review-bar button[role="combobox"]').first();
    await roleSelector.click();
    await page.getByRole('option', { name: 'admin' }).click();

    // Step 2: Open Invoices and record Partial Cash Payment of ₹1,00,000 on INV-2026-042
    await page.locator('.cf-nav-item', { hasText: 'Invoices' }).click();
    await expect(page.locator('h1')).toHaveText('Invoices');

    // Click on INV-2026-042 exact button
    await page.getByRole('button', { name: 'INV-2026-042', exact: true }).click();
    const invoiceDrawer = page.locator('.cf-drawer');
    await expect(invoiceDrawer).toBeVisible();

    // Click Record payment in drawer footer
    await invoiceDrawer.getByRole('button', { name: 'Record payment' }).click();
    const recordDrawer = page.locator('.cf-drawer').filter({ hasText: 'RECORD PAYMENT' });
    await expect(recordDrawer).toBeVisible();

    // Choose Partial Cash preset
    await recordDrawer.getByRole('button', { name: /Partial Cash/i }).click();
    await recordDrawer.getByRole('button', { name: /Review changes/i }).click();
    await recordDrawer.getByRole('button', { name: /Continue to confirmation/i }).click();
    await recordDrawer.getByRole('button', { name: /Confirm payment/i }).click();
    await expect(recordDrawer.getByText('Payment recorded successfully')).toBeVisible();
    await recordDrawer.getByRole('button', { name: 'Return to workspace' }).click();

    // Step 3: Navigate to Payments
    await page.locator('.cf-nav-item', { hasText: 'Payments' }).click();
    await expect(page.locator('h1')).toHaveText('Payments');

    // Step 4: Open action menu for UTR-ICICI-9876543210
    const originalPaymentRow = page.locator('.cf-table tbody tr').filter({ hasText: 'UTR-ICICI-9876543210' });
    await originalPaymentRow.locator('button[aria-label^="Actions for payment"]').click();

    // Step 5: Click Correct / Reverse Payment (CF3-03 verified: no "· Admin" in label)
    const correctBtn = page.getByRole('button', { name: 'Correct / Reverse Payment' });
    await expect(correctBtn).toBeVisible();
    await correctBtn.click();

    const correctionDrawer = page.locator('.cf-drawer').filter({ hasText: 'ADMINISTRATIVE CORRECTION' });
    await expect(correctionDrawer).toBeVisible();

    // CF3-04: Verify simulation disclosure text
    await expect(correctionDrawer).toContainText('This simulation reflects FastAPI backend behavior');
    await expect(correctionDrawer).toContainText('No real API calls are executed');

    // CF3-01 Step 1: Verify projected status is PARTIAL because surviving ₹1,00,000 payment exists
    const projectedStatus = correctionDrawer.locator('dt:has-text("Projected invoice status") + dd');
    await expect(projectedStatus).toHaveText('PARTIAL');

    // Click Confirm Deletion & Proceed to Step 2
    await correctionDrawer.getByRole('button', { name: 'Confirm Deletion & Proceed to Step 2' }).click();
    await expect(correctionDrawer.getByText('Step 1 Complete:')).toBeVisible();

    // Step 6: Choose TDS Only replacement preset
    await correctionDrawer.getByRole('button', { name: /TDS Only/i }).click();
    await correctionDrawer.getByRole('button', { name: 'Review Replacement Changes' }).click();

    // Step 7: Verify Review Replacement Changes reflects complete invoice aggregates
    // Cash Collected: ₹1,00,000.00 → ₹1,00,000.00
    // TDS Recognized: ₹0.00 → ₹10,000.00
    // Total Settled: ₹1,00,000.00 → ₹1,10,000.00
    // Outstanding Balance: ₹4,31,000.00 → ₹4,21,000.00
    // Invoice Status: PARTIAL → PARTIAL
    const diffSection = correctionDrawer.locator('section:has-text("Balance impact after replacement")');
    await expect(diffSection).toBeVisible();

    const cashRow = diffSection.locator('.cf-change-row:has(dt:has-text("Cash Collected"))');
    await expect(cashRow.locator('.cf-change-prev')).toHaveText('₹1,00,000.00');
    await expect(cashRow.locator('.cf-change-curr')).toHaveText('₹1,00,000.00');

    const tdsRow = diffSection.locator('.cf-change-row:has(dt:has-text("TDS Recognized"))');
    await expect(tdsRow.locator('.cf-change-prev')).toHaveText('₹0.00');
    await expect(tdsRow.locator('.cf-change-curr')).toHaveText('₹10,000.00');

    const settledRow = diffSection.locator('.cf-change-row:has(dt:has-text("Total Settled"))');
    await expect(settledRow.locator('.cf-change-prev')).toHaveText('₹1,00,000.00');
    await expect(settledRow.locator('.cf-change-curr')).toHaveText('₹1,10,000.00');

    const outRow = diffSection.locator('.cf-change-row:has(dt:has-text("Outstanding Balance"))');
    await expect(outRow.locator('.cf-change-prev')).toHaveText('₹4,31,000.00');
    await expect(outRow.locator('.cf-change-curr')).toHaveText('₹4,21,000.00');

    const statusRow = diffSection.locator('.cf-change-row:has(dt:has-text("Invoice Status"))');
    await expect(statusRow.locator('.cf-change-prev')).toHaveText('PARTIAL');
    await expect(statusRow.locator('.cf-change-curr')).toHaveText('PARTIAL');

    // Confirm replacement
    await correctionDrawer.getByRole('button', { name: 'Confirm Replacement Payment' }).click();
    await expect(correctionDrawer.getByText('Administrative Correction Completed')).toBeVisible();
    await correctionDrawer.getByRole('button', { name: 'Return to workspace' }).click();

    // Verify invoice in ledger shows resulting balance of ₹4,21,000
    await page.locator('.cf-nav-item', { hasText: 'Invoices' }).click();
    const invRow = page.locator('.cf-table tbody tr').filter({ hasText: 'INV-2026-042' });
    await expect(invRow).toContainText('4,21,000');
  });

  test('CF3-03: Role permission policy allows both Finance and Admin to perform corrections', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Test Finance role (default)
    await page.locator('.cf-nav-item', { hasText: 'Payments' }).click();
    const paymentActions = page.locator('.cf-table tbody tr [aria-label^="Actions for payment"]');
    await expect(paymentActions.first()).toBeVisible();
    await paymentActions.first().click();
    await expect(page.getByRole('button', { name: 'Correct / Reverse Payment' })).toBeVisible();

    // Toggle menu closed
    await paymentActions.first().click();
    await expect(page.getByRole('button', { name: 'Correct / Reverse Payment' })).not.toBeVisible();

    // Test Admin role
    const roleSelector = page.locator('.cf-review-bar button[role="combobox"]').first();
    await roleSelector.click();
    await page.getByRole('option', { name: 'admin' }).click();
    await paymentActions.first().click();
    await expect(page.getByRole('button', { name: 'Correct / Reverse Payment' })).toBeVisible();

    // Toggle menu closed
    await paymentActions.first().click();
    await expect(page.getByRole('button', { name: 'Correct / Reverse Payment' })).not.toBeVisible();

    // Test Viewer role: Correct / Reverse Payment action must NOT appear
    await roleSelector.click();
    await page.getByRole('option', { name: 'viewer' }).click();
    await paymentActions.first().click();
    await expect(page.getByRole('button', { name: 'Correct / Reverse Payment' })).not.toBeVisible();
  });
});
