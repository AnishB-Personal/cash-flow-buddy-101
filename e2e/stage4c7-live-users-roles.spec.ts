import { test, expect } from '@playwright/test';

test.describe('Stage 4C.7 — LIVE Mode User Administration & RBAC E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');
    await expect(page.locator('h1')).toHaveText('CollectFlow');
  });

  test('CF4C7-LIVE-01: Admin logs in, navigates to /users, sees PostgreSQL accounts and KPIs', async ({ page }) => {
    // 1. Log in as sandbox_admin
    await page.fill('#username', 'sandbox_admin');
    await page.fill('#password', 'AdminPass123!');
    await page.click('button[type="submit"]');

    // 2. Wait for workspace
    await expect(page.locator('h1')).toHaveText('Business overview');

    // 3. Navigate to Users & Roles
    await page.locator('.cf-sidebar .cf-nav-item', { hasText: 'Users & Roles' }).click();
    await expect(page.locator('h1')).toHaveText('Users & Roles');
    await expect(page.locator('[data-testid="users-screen"]')).toBeVisible();

    // 4. Verify PostgreSQL seeded users are listed in the table
    await expect(page.locator('[data-testid="user-row-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-row-2"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-row-3"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-row-4"]')).toBeVisible();

    // 5. Verify KPI counts
    const kpiTotal = page.locator('[data-testid="metric-total-users"] strong');
    await expect(kpiTotal).toBeVisible();
    const count = await kpiTotal.textContent();
    expect(Number(count)).toBeGreaterThanOrEqual(4);

    // 6. Verify Admin action button is enabled
    await expect(page.locator('[data-testid="btn-new-user"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-new-user"]')).toBeEnabled();
  });

  test('CF4C7-LIVE-02: Non-admin viewer sees viewing mode banner and disabled New User action', async ({ page }) => {
    // 1. Log in as sandbox_viewer
    await page.fill('#username', 'sandbox_viewer');
    await page.fill('#password', 'ViewerPass123!');
    await page.click('button[type="submit"]');

    // 2. Wait for workspace
    await expect(page.locator('h1')).toHaveText('Business overview');

    // 3. Navigate to Users & Roles
    await page.locator('.cf-sidebar .cf-nav-item', { hasText: 'Users & Roles' }).click();
    await expect(page.locator('h1')).toHaveText('Users & Roles');

    // 4. Verify Viewing mode banner
    await expect(page.locator('[data-testid="users-viewing-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="users-viewing-banner"]')).toContainText('Viewing mode: User administration is restricted to Administrators');

    // 5. Verify New User button is disabled
    await expect(page.locator('[data-testid="btn-new-user-disabled"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-new-user-disabled"]')).toBeDisabled();
  });

  test('CF4C7-LIVE-03: Admin provisions new user with 12+ char complex password and updates role in LIVE mode', async ({ page }) => {
    // 1. Log in as sandbox_admin
    await page.fill('#username', 'sandbox_admin');
    await page.fill('#password', 'AdminPass123!');
    await page.click('button[type="submit"]');

    // 2. Wait for workspace
    await expect(page.locator('h1')).toHaveText('Business overview');

    // 3. Navigate to Users & Roles
    await page.locator('.cf-sidebar .cf-nav-item', { hasText: 'Users & Roles' }).click();
    await expect(page.locator('[data-testid="users-screen"]')).toBeVisible();

    // 4. Open New User Drawer
    await page.click('[data-testid="btn-new-user"]');
    await expect(page.locator('role=dialog')).toBeVisible();
    await expect(page.locator('text=USER ADMINISTRATION WORKFLOW')).toBeVisible();

    // 5. Fill form with weak password first to verify live password validation
    const testUsername = `uat_user_${Date.now().toString().slice(-4)}`;
    await page.fill('#user-username', testUsername);
    await page.fill('#user-password', 'short1');
    await page.click('button:has-text("Proceed to validation")');

    // Verify complexity error displayed in Step 2: Validation
    await expect(page.locator('text=Password must be at least 12 characters long')).toBeVisible();
    await expect(page.locator('button:has-text("Continue to review")')).toBeDisabled();

    // Click Back to form
    await page.click('button:has-text("Back to form")');

    // 6. Fill valid strong password
    await page.fill('#user-password', 'ValidUatPass123!');
    await page.fill('#user-fullname', 'Live UAT User');
    await page.selectOption('#user-role', 'finance');

    // Proceed to Step 2: Validation
    await page.click('button:has-text("Proceed to validation")');
    await expect(page.locator('text=Password policy validation:')).toBeVisible();
    await expect(page.locator('button:has-text("Continue to review")')).toBeEnabled();

    // Proceed to Step 3: Review
    await page.click('button:has-text("Continue to review")');
    await expect(page.locator('text=Previous vs proposed changes')).toBeVisible();

    // Proceed to Step 4: Confirm
    await page.click('button:has-text("Continue to confirmation")');
    await expect(page.locator('text=Confirm administrative action')).toBeVisible();

    // Confirm creation
    await page.click('button:has-text("Confirm create user")');

    // Step 5: Result
    await expect(page.locator('text=User account successfully created')).toBeVisible();
    await expect(page.locator('text=User directory state is updated and persisted in PostgreSQL')).toBeVisible();

    // Close drawer
    await page.click('button[aria-label="Close user drawer"]');
    await expect(page.locator('role=dialog')).not.toBeVisible();

    // Verify user in live list
    await expect(page.locator(`tr:has-text("@${testUsername}")`)).toBeVisible();

    // Now test editing this newly created user
    const editBtn = page.locator(`button[aria-label="Edit role for ${testUsername}"]`).first();
    await editBtn.click();
    await expect(page.locator('role=dialog')).toBeVisible();
    await expect(page.locator(`text=Edit User · @${testUsername}`)).toBeVisible();

    // Change role from finance to sales
    await page.selectOption('#edit-role', 'sales');
    await page.click('button:has-text("Proceed to validation")');
    await page.click('button:has-text("Continue to review")');
    await page.click('button:has-text("Continue to confirmation")');
    await page.click('button:has-text("Confirm update user")');

    await expect(page.locator('text=User details successfully updated')).toBeVisible();
    await page.click('button[aria-label="Close user drawer"]');

    // Now test deleting this test user
    const deleteBtn = page.locator(`button[aria-label="Delete user ${testUsername}"]`).first();
    await deleteBtn.click();
    await expect(page.locator('role=dialog')).toBeVisible();
    await expect(page.locator(`text=Delete User · @${testUsername}`)).toBeVisible();

    await page.click('button:has-text("Proceed to validation")');
    await page.click('button:has-text("Continue to review")');
    await page.click('button:has-text("Continue to confirmation")');
    await page.click('button:has-text("Confirm delete user")');

    await expect(page.locator('text=User account successfully deleted')).toBeVisible();
    await page.click('button[aria-label="Close user drawer"]');

    // Verify user is gone from UI
    await expect(page.locator(`tr:has-text("@${testUsername}")`)).not.toBeVisible();
  });
});
