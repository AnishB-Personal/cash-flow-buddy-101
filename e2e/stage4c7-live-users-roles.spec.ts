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

  test('CF4C7-LIVE-04: Non-admin direct API mutation rejection (HTTP 403 Forbidden)', async ({ page, request }) => {
    // 1. Log in as sandbox_viewer
    const loginPromise = page.waitForResponse(
      (res) => res.url().includes('/api/auth/login') && res.request().method() === 'POST'
    );
    await page.fill('#username', 'sandbox_viewer');
    await page.fill('#password', 'ViewerPass123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('h1')).toHaveText('Business overview');

    const loginRes = await loginPromise;
    const token = (await loginRes.json()).token;
    const headers = { Authorization: `Bearer ${token}` };

    // 2. Direct mutation attempts are rejected with 403
    const postRes = await request.post('http://127.0.0.1:8000/api/users', {
      headers,
      data: { username: 'hacker_user', password: 'HackerPass123!', role: 'admin' },
    });
    expect(postRes.status()).toBe(403);

    const putRes = await request.put('http://127.0.0.1:8000/api/users/1', {
      headers,
      data: { role: 'admin' },
    });
    expect(putRes.status()).toBe(403);

    const passRes = await request.put('http://127.0.0.1:8000/api/users/1/password', {
      headers,
      data: { new_password: 'NewAdminPass123!' },
    });
    expect(passRes.status()).toBe(403);

    const delRes = await request.delete('http://127.0.0.1:8000/api/users/1', {
      headers,
    });
    expect(delRes.status()).toBe(403);
  });

  test('CF4C7-LIVE-05: User creation persists in PostgreSQL across full page reload', async ({ page }) => {
    // 1. Log in as sandbox_admin
    await page.fill('#username', 'sandbox_admin');
    await page.fill('#password', 'AdminPass123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('h1')).toHaveText('Business overview');

    // 2. Navigate to Users & Roles
    await page.locator('.cf-sidebar .cf-nav-item', { hasText: 'Users & Roles' }).click();
    await expect(page.locator('[data-testid="users-screen"]')).toBeVisible();

    // 3. Provision new user
    const testUser = `reload_usr_${Date.now().toString().slice(-4)}`;
    await page.click('[data-testid="btn-new-user"]');
    await page.fill('#user-username', testUser);
    await page.fill('#user-password', 'ReloadPass123!');
    await page.fill('#user-fullname', 'Reload Persistence Test');
    await page.selectOption('#user-role', 'sales');
    await page.click('button:has-text("Proceed to validation")');
    await page.click('button:has-text("Continue to review")');
    await page.click('button:has-text("Continue to confirmation")');
    await page.click('button:has-text("Confirm create user")');
    await expect(page.locator('text=User account successfully created')).toBeVisible();
    await page.click('button[aria-label="Close user drawer"]');

    // 4. Verify user in table before reload
    await expect(page.locator(`tr:has-text("@${testUser}")`)).toBeVisible();

    // 5. Perform hard page reload
    await page.reload();
    await expect(page.locator('[data-testid="users-screen"]')).toBeVisible();

    // 6. Verify user is still present after reload (PostgreSQL persistence)
    await expect(page.locator(`tr:has-text("@${testUser}")`)).toBeVisible();

    // 7. Cleanup test user
    const deleteBtn = page.locator(`button[aria-label="Delete user ${testUser}"]`).first();
    await deleteBtn.click();
    await page.click('button:has-text("Proceed to validation")');
    await page.click('button:has-text("Continue to review")');
    await page.click('button:has-text("Continue to confirmation")');
    await page.click('button:has-text("Confirm delete user")');
    await expect(page.locator('text=User account successfully deleted')).toBeVisible();
    await page.click('button[aria-label="Close user drawer"]');
    await expect(page.locator(`tr:has-text("@${testUser}")`)).not.toBeVisible();
  });

  test('CF4C7-LIVE-06: Self-deletion and last-admin demotion rejected with HTTP 400', async ({ page, request }) => {
    // 1. Log in as sandbox_admin
    const loginPromise = page.waitForResponse(
      (res) => res.url().includes('/api/auth/login') && res.request().method() === 'POST'
    );
    await page.fill('#username', 'sandbox_admin');
    await page.fill('#password', 'AdminPass123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('h1')).toHaveText('Business overview');

    const loginRes = await loginPromise;
    const adminData = await loginRes.json();
    const adminId = adminData.user.id;
    const headers = { Authorization: `Bearer ${adminData.token}` };

    // 2. Direct API call attempting self-deletion
    const delSelf = await request.delete(`http://127.0.0.1:8000/api/users/${adminId}`, { headers });
    expect(delSelf.status()).toBe(400);
    const delJson = await delSelf.json();
    expect(delJson.detail).toContain('Cannot delete your own account');

    // 3. Direct API call attempting last-admin demotion
    const demoteAdmin = await request.put(`http://127.0.0.1:8000/api/users/${adminId}/role`, {
      headers,
      data: { role: 'viewer' },
    });
    expect(demoteAdmin.status()).toBe(400);
    const demoteJson = await demoteAdmin.json();
    expect(demoteJson.detail).toContain('must have at least one active administrator');
  });
});
