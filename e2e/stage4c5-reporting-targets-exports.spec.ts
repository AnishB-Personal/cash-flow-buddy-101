import { test, expect } from "@playwright/test";

const FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || "http://127.0.0.1:8000";

test.describe("Stage 4C.5: LIVE Sales Targets, Reporting Hub, AR Aging & Exports E2E", () => {
  test("CF4C5-E2E-01: Backend readiness and OpenAPI contracts validation", async ({ request }) => {
    const readyRes = await request.get(`${BACKEND_URL}/ready`);
    expect(readyRes.status()).toBe(200);
    const readyJson = await readyRes.json();
    expect(readyJson.status).toBe("ready");
    expect(readyJson.database).toBe("connected");

    const openapiRes = await request.get(`${BACKEND_URL}/openapi.json`);
    expect(openapiRes.status()).toBe(200);
    const openapi = await openapiRes.json();

    // Verify reporting routes
    expect(openapi.paths["/api/reporting/summary"]).toBeDefined();
    expect(openapi.paths["/api/reporting/ar-aging"]).toBeDefined();
    expect(openapi.paths["/api/reporting/attainment"]).toBeDefined();
    expect(openapi.paths["/api/reporting/customer-exposure"]).toBeDefined();

    // Verify targets routes
    expect(openapi.paths["/api/targets"]).toBeDefined();
    expect(openapi.paths["/api/targets/{user_id}"]).toBeDefined();

    // Verify export routes
    expect(openapi.paths["/api/export/token"]).toBeDefined();
    expect(openapi.paths["/api/export/excel"]).toBeDefined();
    expect(openapi.paths["/api/export/csv"]).toBeDefined();
  });

  test("CF4C5-E2E-02: LIVE Financial Dashboard & AR Aging display", async ({ page }) => {
    // 1. Log in as admin
    await page.goto(`${FRONTEND_URL}/login`);
    await page.getByLabel("Username").fill("sandbox_admin");
    await page.getByLabel("Password").fill("AdminPass123!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    await expect(page).toHaveURL(`${FRONTEND_URL}/`);

    // 2. Check Financial Dashboard header and metrics
    await expect(page.getByRole("heading", { name: /Invoiced vs Settlements/i })).toBeVisible();

    // Aging section
    await expect(page.getByText(/Current \/ Not Due/i).first()).toBeVisible();
  });

  test("CF4C5-E2E-03: LIVE Sales Targets & Target Drawer", async ({ page }) => {
    // 1. Log in as admin
    await page.goto(`${FRONTEND_URL}/login`);
    await page.getByLabel("Username").fill("sandbox_admin");
    await page.getByLabel("Password").fill("AdminPass123!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    // 2. Navigate to Sales Targets
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Sales Targets" }).click();

    await expect(page).toHaveURL(`${FRONTEND_URL}/sales-targets`);
    await expect(page.getByRole("heading", { name: /Sales Targets & Quotas/i })).toBeVisible();

    // 3. Open Configure Target drawer
    const configBtn = page.getByRole("button", { name: /Configure.*Target/i });
    await expect(configBtn).toBeVisible();
    await configBtn.click();

    // 4. Verify Target Drawer is opened
    await expect(page.getByRole("heading", { name: /Configure Sales Target/i })).toBeVisible();

    // 5. Check sales rep dropdown exists
    const repSelect = page.locator("#target-rep");
    await expect(repSelect).toBeVisible();

    // Close drawer
    await page.getByRole("button", { name: /Cancel/i }).first().click();
  });

  test("CF4C5-E2E-04: LIVE Export Drawer 5-Step Workflow & Single-Use Ticket Enforcement", async ({ page, request }) => {
    // 1. Backend single-use ticket lifecycle test via API
    const loginRes = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    expect(loginRes.status()).toBe(200);
    const { token } = await loginRes.json();

    const ticketRes = await request.post(`${BACKEND_URL}/api/export/token`, {
      data: { format: "excel", fy: "ALL", scope: "all" },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([200, 201]).toContain(ticketRes.status());
    const ticketData = await ticketRes.json();
    const exportTicket = ticketData.token || ticketData.ticket;
    expect(exportTicket).toBeDefined();
    expect(ticketData.expires_in).toBe(300);

    // First download consumption succeeds
    const downloadRes1 = await request.get(`${BACKEND_URL}/api/export/excel?ticket=${exportTicket}&fy=ALL&scope=all`);
    expect(downloadRes1.status()).toBe(200);
    expect(downloadRes1.headers()["content-type"]).toContain("spreadsheetml");

    // Second download consumption fails with 401/410 (atomic single-use row lock)
    const downloadRes2 = await request.get(`${BACKEND_URL}/api/export/excel?ticket=${exportTicket}&fy=ALL&scope=all`);
    expect([401, 410]).toContain(downloadRes2.status());

    // 2. Full Browser UI 5-Step Export Workflow
    await page.goto(`${FRONTEND_URL}/login`);
    await page.getByLabel("Username").fill("sandbox_admin");
    await page.getByLabel("Password").fill("AdminPass123!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    // Navigate to Reports Hub
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Reports" }).click();
    await expect(page).toHaveURL(`${FRONTEND_URL}/reports`);

    // Click Export Report button
    await page.getByTestId("export-report-btn").click();

    // Step 1: Scope & Format
    await expect(page.getByRole("heading", { name: /Generate Financial Export/i })).toBeVisible();
    await page.getByRole("button", { name: /Continue to Preview/i }).click();

    // Step 2: Matched Scope Preview
    await expect(page.getByText(/Matched Scope/i)).toBeVisible();
    await page.getByRole("button", { name: /Review Columns & Totals/i }).click();

    // Step 3: Review Columns & Totals
    await expect(page.getByText(/Authoritative 17 Columns Checklist/i)).toBeVisible();
    await page.getByRole("button", { name: /Proceed to Confirmation/i }).click();

    // Step 4: Confirm / Pre-Flight Checks
    await expect(page.getByText(/Pre-Flight Security & Integrity Checks/i)).toBeVisible();
    await page.getByRole("button", { name: /Confirm & Generate Excel Export/i }).click();

    // Step 5: Result & Ticket Verification
    await expect(page.getByRole("heading", { name: /Export Ready for Download/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Download Export File/i })).toBeVisible();
  });

  test("CF4C5-E2E-05: RBAC - Sales role export restriction", async ({ request }) => {
    // Authenticate as sales user
    const loginRes = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_sales", password: "SalesPass123!" },
    });
    expect(loginRes.status()).toBe(200);
    const { token } = await loginRes.json();

    // Sales cannot issue export token -> HTTP 403 Forbidden
    const ticketRes = await request.post(`${BACKEND_URL}/api/export/token`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(ticketRes.status()).toBe(403);
  });
});
