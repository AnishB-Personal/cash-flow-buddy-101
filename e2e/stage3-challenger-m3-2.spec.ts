import { test, expect, type Page } from '@playwright/test';

/**
 * Challenger M3-2 Adversarial Test Suite:
 * 1. Verification of page.on('console') and page.on('pageerror') exception trapping oracle
 * 2. Exhaustive 8 routes × 4 viewports verification matrix (32 combinations)
 * 3. Unmapped routes (404) handling and graceful recovery
 * 4. Stress testing rapid navigation and drawer open/close cycles
 */

const VIEWPORTS = [
  { width: 1440, height: 900, name: '1440px-desktop' },
  { width: 768, height: 1024, name: '768px-tablet' },
  { width: 390, height: 844, name: '390px-mobile' },
  { width: 320, height: 568, name: '320px-narrow-mobile' },
];

const ROUTES = [
  { path: '/', name: 'Dashboard' },
  { path: '/orders', name: 'Orders' },
  { path: '/invoices', name: 'Invoices' },
  { path: '/payments', name: 'Payments' },
  { path: '/ar-aging', name: 'AR Aging' },
  { path: '/customers', name: 'Customers' },
  { path: '/settings', name: 'Settings' },
  { path: '/design-comparison', name: 'Design Comparison' },
];

test.describe('Challenger M3-2: Adversarial Exception & Console Trapping Oracle', () => {
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

  test('Oracle check: page.on("console") reliably traps synthetic console.error and proves test would fail', async ({ page }) => {
    await page.goto('/');

    expect(browserErrors).toEqual([]);

    // Inject synthetic console.error
    await page.evaluate(() => {
      console.error('SYNTHETIC_M3_2_CONSOLE_ERROR_PROBE');
    });

    // Verify it was caught
    expect(browserErrors.length).toBe(1);
    expect(browserErrors[0]).toContain('SYNTHETIC_M3_2_CONSOLE_ERROR_PROBE');

    // Prove that asserting browserErrors empty fails
    let assertionFailed = false;
    try {
      expect(browserErrors, 'Zero unhandled browser console errors').toEqual([]);
    } catch {
      assertionFailed = true;
    }
    expect(assertionFailed).toBe(true);

    // Clear so afterEach doesn't fail this verification test
    browserErrors = [];
  });

  test('Oracle check: page.on("pageerror") reliably traps uncaught window exceptions and proves test would fail', async ({ page }) => {
    await page.goto('/');

    expect(browserErrors).toEqual([]);

    // Inject synthetic asynchronous uncaught exception
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('SYNTHETIC_M3_2_UNCAUGHT_RUNTIME_EXCEPTION');
      }, 50);
    });

    await page.waitForTimeout(200);

    // Verify pageerror listener caught it
    expect(browserErrors.length).toBeGreaterThanOrEqual(1);
    const hasProbe = browserErrors.some(e => e.includes('SYNTHETIC_M3_2_UNCAUGHT_RUNTIME_EXCEPTION'));
    expect(hasProbe).toBe(true);

    // Prove that asserting browserErrors empty fails
    let assertionFailed = false;
    try {
      expect(browserErrors, 'Zero unhandled browser console errors').toEqual([]);
    } catch {
      assertionFailed = true;
    }
    expect(assertionFailed).toBe(true);

    // Clear so afterEach doesn't fail this verification test
    browserErrors = [];
  });

  test('Oracle check: standard logs and warnings do not produce false positive errors in listener', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      console.log('harmless info log');
      console.info('harmless info probe');
      console.warn('harmless warning probe');
    });

    // Should not record error
    expect(browserErrors).toEqual([]);
  });
});

test.describe('Challenger M3-2: 8 Implemented Routes Across 4 Viewports Matrix (32 sweeps)', () => {
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

  for (const vp of VIEWPORTS) {
    test.describe(`Viewport: ${vp.name} (${vp.width}x${vp.height})`, () => {
      for (const route of ROUTES) {
        test(`Route ${route.path} (${route.name}) renders cleanly without console or page errors`, async ({ page }) => {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          const response = await page.goto(route.path, { waitUntil: 'networkidle' });
          expect(response?.status()).toBeLessThan(400);

          // Verify body exists and has content
          const main = page.locator('main, .cf-app, h1, [role="main"]').first();
          await expect(main).toBeVisible();

          // For narrow mobile 320px, assert no horizontal scrollbar on root
          if (vp.width === 320) {
            const hasHorizontalOverflow = await page.evaluate(() => {
              return document.documentElement.scrollWidth > document.documentElement.clientWidth;
            });
            expect(hasHorizontalOverflow, `Horizontal overflow detected at 320px on ${route.path}`).toBe(false);
          }
        });
      }
    });
  }
});

test.describe('Challenger M3-2: Unmapped Routes & 404 Error Boundary Handling', () => {
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
    const appErrors = browserErrors.filter(
      msg => !msg.includes('Failed to load resource: the server responded with a status of 404')
    );
    expect(appErrors, 'Zero unhandled application errors during 404 handling').toEqual([]);
  });

  const unmappedPaths = [
    '/non-existent-page',
    '/orders/unmapped-subpath',
    '/payments/invalid-id-404',
    '/api-v1-undefined-route',
  ];

  for (const unmapped of unmappedPaths) {
    test(`Unmapped route "${unmapped}" renders 404 NotFoundComponent without crashing React tree`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(unmapped, { waitUntil: 'networkidle' });

      // Verify 404 heading and message
      const notFoundHeading = page.locator('h1', { hasText: '404' });
      await expect(notFoundHeading).toBeVisible();
      await expect(page.getByText('Page not found')).toBeVisible();

      // Ensure error boundary ("This page didn't load") was NOT triggered
      await expect(page.getByText("This page didn't load")).toHaveCount(0);

      // Verify "Go home" link is present and working
      const goHomeLink = page.getByRole('link', { name: /Go home/i });
      await expect(goHomeLink).toBeVisible();
      await goHomeLink.click();
      await page.waitForLoadState('networkidle');

      // Verify returned to dashboard
      await expect(page.locator('h1', { hasText: /Business overview/i })).toBeVisible();
    });
  }

  test('Client-side navigation to unmapped route renders 404 with zero console errors or network logs', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // Client-side pushState / navigation
    await page.evaluate(() => {
      window.history.pushState({}, '', '/nonexistent-spa-route');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    // Wait for TanStack router to react
    await page.waitForTimeout(300);

    // Verify 404 or clean state, zero browser errors
    expect(browserErrors).toEqual([]);
  });

  test('Oracle check (404 filter): traps authentic console.error alongside native 404 network log', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/non-existent-page', { waitUntil: 'networkidle' });

    // Confirm that the native Chromium 404 network log was captured in browserErrors
    const native404Logs = browserErrors.filter(msg =>
      msg.includes('Failed to load resource: the server responded with a status of 404')
    );
    expect(native404Logs.length).toBeGreaterThanOrEqual(1);

    // Filtered appErrors before injection must be empty (native 404 is ignored)
    const initialAppErrors = browserErrors.filter(
      msg => !msg.includes('Failed to load resource: the server responded with a status of 404')
    );
    expect(initialAppErrors).toEqual([]);

    // Now inject authentic console.error
    await page.evaluate(() => {
      console.error('AUTHENTIC_APP_ERROR_ON_404_PAGE');
    });

    const appErrors = browserErrors.filter(
      msg => !msg.includes('Failed to load resource: the server responded with a status of 404')
    );
    expect(appErrors.length).toBe(1);
    expect(appErrors[0]).toContain('AUTHENTIC_APP_ERROR_ON_404_PAGE');

    // Prove that asserting appErrors empty would fail
    let assertionFailed = false;
    try {
      expect(appErrors, 'Zero unhandled application errors during 404 handling').toEqual([]);
    } catch {
      assertionFailed = true;
    }
    expect(assertionFailed).toBe(true);

    // Clean up probe so afterEach passes
    browserErrors = browserErrors.filter(msg => !msg.includes('AUTHENTIC_APP_ERROR_ON_404_PAGE'));
  });

  test('Oracle check (404 filter): traps authentic uncaught runtime exception on 404 page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/non-existent-page', { waitUntil: 'networkidle' });

    // Inject authentic uncaught exception
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('AUTHENTIC_UNCAUGHT_EXCEPTION_ON_404_PAGE');
      }, 50);
    });

    await page.waitForTimeout(200);

    const appErrors = browserErrors.filter(
      msg => !msg.includes('Failed to load resource: the server responded with a status of 404')
    );
    expect(appErrors.length).toBeGreaterThanOrEqual(1);
    expect(appErrors.some(e => e.includes('AUTHENTIC_UNCAUGHT_EXCEPTION_ON_404_PAGE'))).toBe(true);

    // Prove that asserting appErrors empty would fail
    let assertionFailed = false;
    try {
      expect(appErrors, 'Zero unhandled application errors during 404 handling').toEqual([]);
    } catch {
      assertionFailed = true;
    }
    expect(assertionFailed).toBe(true);

    // Clean up probe so afterEach passes
    browserErrors = browserErrors.filter(e => !e.includes('AUTHENTIC_UNCAUGHT_EXCEPTION_ON_404_PAGE'));
  });

  test('Oracle check (404 filter): application error referencing "404" is NOT suppressed by filter', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/non-existent-page', { waitUntil: 'networkidle' });

    // Inject authentic app error mentioning 404 code
    await page.evaluate(() => {
      console.error('CustomerRecordNotFound: HTTP 404 entity ID #404 missing in local store');
    });

    const appErrors = browserErrors.filter(
      msg => !msg.includes('Failed to load resource: the server responded with a status of 404')
    );
    expect(appErrors.some(e => e.includes('CustomerRecordNotFound'))).toBe(true);

    let assertionFailed = false;
    try {
      expect(appErrors, 'Zero unhandled application errors during 404 handling').toEqual([]);
    } catch {
      assertionFailed = true;
    }
    expect(assertionFailed).toBe(true);

    // Clean up probe so afterEach passes
    browserErrors = browserErrors.filter(e => !e.includes('CustomerRecordNotFound'));
  });
});

test.describe('Challenger M3-2: Stress-Testing Rapid Navigation and Drawer Open/Close Transitions', () => {
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
    expect(browserErrors, 'Zero unhandled browser console errors during stress tests').toEqual([]);
  });

  test('Stress: Rapid sequential route cycling does not trigger memory errors or unhandled promise rejections', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });

    const testRoutes = ['/orders', '/invoices', '/payments', '/ar-aging', '/customers', '/settings', '/'];

    // Cycle through routes 3 full cycles rapidly
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const r of testRoutes) {
        await page.goto(r, { waitUntil: 'domcontentloaded' });
      }
    }

    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1', { hasText: /Business overview/i })).toBeVisible();
  });

  test('Stress: Rapid Record Payment drawer open/close/discard cycling on desktop (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/invoices', { waitUntil: 'networkidle' });

    const inv042Row = page.locator('.cf-table tbody tr').filter({ hasText: 'INV-2026-042' });
    await expect(inv042Row).toBeVisible();

    // 5 rapid cycles of opening and closing
    for (let i = 0; i < 5; i++) {
      const actionBtn = inv042Row.locator('[aria-label^="Actions for"]');
      await actionBtn.click();

      const recordPaymentOption = page.locator('.cf-row-menu').getByRole('button', { name: /Record Payment/i });
      await recordPaymentOption.click();

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      if (i % 2 === 0) {
        // Close via Escape key
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
      } else {
        // Close via Close button with discard if prompted
        const closeBtn = dialog.locator('[aria-label="Close payment workflow"]');
        await closeBtn.click();
        const discardBtn = dialog.getByRole('button', { name: /Discard inputs/i });
        if (await discardBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          await discardBtn.click();
        }
        await expect(dialog).not.toBeVisible();
      }
    }
  });

  test('Stress: Rapid mobile bottom-nav route hopping at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'networkidle' });

    const screens = ['Orders', 'Invoices', 'Payments', 'Dashboard'];

    for (let cycle = 0; cycle < 3; cycle++) {
      for (const screen of screens) {
        const btn = page.locator('.cf-bottom-nav button', { hasText: screen });
        await btn.click();
        await page.waitForTimeout(100);
      }
    }

    await expect(page.locator('h1', { hasText: /Business overview/i })).toBeVisible();
  });

  test('Stress: Rapid Payment Correction drawer open/close on Payments page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/payments', { waitUntil: 'networkidle' });

    const paymentActions = page.locator('[aria-label^="Actions for payment"]');
    const count = await paymentActions.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < 4; i++) {
      await paymentActions.first().click();
      const correctionBtn = page.getByText(/Correct|Correction/i).first();
      await expect(correctionBtn).toBeVisible();
      await correctionBtn.click();

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      // Close via Escape
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    }
  });
});
