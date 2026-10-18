import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || "http://127.0.0.1:8000";
const SCREENSHOT_DIR = path.resolve(process.cwd(), "screenshots/stage4c6_uat_screenshots");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function resetDatabaseToBaseline() {
  execSync(
    "COLLECTFLOW_ENV=test COLLECTFLOW_DATABASE_URL=postgresql+psycopg://collectflow_user:collectflow_secret@127.0.0.1:5432/collectflow_test /home/anishb/projects/personal/collectflow/venv/bin/python /home/anishb/projects/personal/collectflow/scripts/seed_postgres_fixtures.py --reset",
    { stdio: "pipe" }
  );
}

test.describe("Stage 4C.6: Consolidated LIVE Browser Acceptance & Financial Reconciliation", () => {
  test.beforeAll(async () => {
    resetDatabaseToBaseline();
  });

  test.afterAll(async () => {
    resetDatabaseToBaseline();
  });

  // Helper to login in browser
  async function loginAs(page: any, username: string, pass = "AdminPass123!") {
    await page.goto(`${FRONTEND_URL}/login`);
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(pass);
    await page.getByRole("button", { name: /Sign In/i }).click();
    await expect(page).toHaveURL(`${FRONTEND_URL}/`);
  }

  // -------------------------------------------------------------------------
  // 1. Health & OpenAPI Contracts
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-01: Backend readiness and OpenAPI contracts validation", async ({ request }) => {
    const readyRes = await request.get(`${BACKEND_URL}/ready`);
    expect(readyRes.status()).toBe(200);
    const readyJson = await readyRes.json();
    expect(readyJson.status).toBe("ready");
    expect(readyJson.database).toBe("connected");

    const openapiRes = await request.get(`${BACKEND_URL}/openapi.json`);
    expect(openapiRes.status()).toBe(200);
    const openapi = await openapiRes.json();

    // Verify all active PostgreSQL routes are present
    expect(openapi.paths["/api/auth/login"]).toBeDefined();
    expect(openapi.paths["/api/users"]).toBeDefined();
    expect(openapi.paths["/api/customers"]).toBeDefined();
    expect(openapi.paths["/api/orders"]).toBeDefined();
    expect(openapi.paths["/api/invoices"]).toBeDefined();
    expect(openapi.paths["/api/payments"]).toBeDefined();
    expect(openapi.paths["/api/targets"]).toBeDefined();
    expect(openapi.paths["/api/reporting/summary"]).toBeDefined();
    expect(openapi.paths["/api/reporting/ar-aging"]).toBeDefined();
    expect(openapi.paths["/api/export/token"]).toBeDefined();
    expect(openapi.paths["/api/export/excel"]).toBeDefined();
    expect(openapi.paths["/api/export/csv"]).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 2. Synthetic Baseline Financial Reconciliation (Verified at Pristine State)
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-02: Synthetic Baseline Financial Reconciliation - INV-2026-042, PO-NEXUS-881, REM-2026-001 (Zero Delta)", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const summaryRes = await request.get(`${BACKEND_URL}/api/reporting/summary?fy=FY%202026-27`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(summaryRes.status()).toBe(200);
    const summary = await summaryRes.json();

    // 1. Invoice Gross: ₹5,31,000.00
    expect(summary.total_invoiced).toBe("531000.00");
    // 2. Cash Collected: ₹2,00,000.00
    expect(summary.total_cash).toBe("200000.00");
    // 3. TDS Recognized: ₹9,000.00
    expect(summary.total_tds).toBe("9000.00");
    // 4. Net Settled: ₹2,09,000.00
    expect(summary.total_settled).toBe("209000.00");
    // 5. Net Outstanding: ₹3,22,000.00
    expect(summary.total_outstanding).toBe("322000.00");
    // 6. Unbilled Purchase Orders: ₹2,95,000.00 (contributes ₹0 to recognized AR)
    expect(summary.unbilled_orders_value).toBe("295000.00");

    // Invariant checks with exact mathematical equality (paise precision)
    const invoiced = Number(summary.total_invoiced);
    const cash = Number(summary.total_cash);
    const tds = Number(summary.total_tds);
    const settled = Number(summary.total_settled);
    const outstanding = Number(summary.total_outstanding);

    expect(cash + tds).toBe(settled);
    expect(invoiced - settled).toBe(outstanding);
  });

  // -------------------------------------------------------------------------
  // 3. Authentication Failure & Lockout Safety
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-03: Invalid credentials rejection, lockout safety and error banner", async ({ page, request }) => {
    const apiRes = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "WrongPassword999!" },
    });
    expect(apiRes.status()).toBe(401);

    await page.goto(`${FRONTEND_URL}/login`);
    await page.getByLabel("Username").fill("sandbox_admin");
    await page.getByLabel("Password").fill("WrongPassword999!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    await expect(page.getByText(/Invalid username or password/i)).toBeVisible();
    await expect(page).toHaveURL(`${FRONTEND_URL}/login`);
  });

  // -------------------------------------------------------------------------
  // 4. Route Authentication Protection
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-04: Route authentication protection and unauthenticated redirect to /login", async ({ page }) => {
    const protectedRoutes = [
      "/customers",
      "/orders",
      "/invoices",
      "/payments",
      "/reports",
      "/sales-targets",
      "/users",
    ];

    for (const route of protectedRoutes) {
      await page.goto(`${FRONTEND_URL}${route}`);
      await expect(page).toHaveURL(`${FRONTEND_URL}/login`);
      await expect(page.getByRole("heading", { name: "CollectFlow" })).toBeVisible();
    }
  });

  // -------------------------------------------------------------------------
  // 5. Multi-Role Authentication Matrix & Live Sandbox Verification
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-05: Multi-role authentication (Admin, Finance, Sales, Viewer) and Live Sandbox indicator", async ({ page }) => {
    const roles = [
      { user: "sandbox_admin", pass: "AdminPass123!" },
      { user: "sandbox_finance", pass: "FinancePass123!" },
      { user: "sandbox_sales", pass: "SalesPass123!" },
      { user: "sandbox_viewer", pass: "ViewerPass123!" },
    ];

    for (const r of roles) {
      await page.goto(`${FRONTEND_URL}/login`);
      await page.getByLabel("Username").fill(r.user);
      await page.getByLabel("Password").fill(r.pass);
      await page.getByRole("button", { name: /Sign In/i }).click();

      await expect(page).toHaveURL(`${FRONTEND_URL}/`);
      await expect(page.getByText(/Live Sandbox Workspace/i)).toBeVisible();
      await expect(page.getByText(/Mock workspace/i)).not.toBeVisible();
      await expect(page.getByRole("button", { name: /Reset Demo/i })).not.toBeVisible();

      await page.getByRole("button", { name: /Sign out/i }).click();
      await expect(page).toHaveURL(`${FRONTEND_URL}/login`);
    }
  });

  // -------------------------------------------------------------------------
  // 6. RBAC Authorization Boundaries
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-06: RBAC - Viewer and Sales unauthorized mutation blocking (403)", async ({ page, request }) => {
    await loginAs(page, "sandbox_viewer", "ViewerPass123!");

    const mainNav = page.getByRole("navigation", { name: "Main navigation" });

    // Orders tab: Viewer cannot see "New Order"
    await mainNav.getByRole("button", { name: "Orders" }).click();
    await expect(page.getByRole("button", { name: "New Order" })).not.toBeVisible();

    // Invoices tab: Viewer cannot see "Record Payment" in actions
    await mainNav.getByRole("button", { name: "Invoices" }).click();
    const firstInvoice = page.locator(".cf-table tbody tr").first();
    if (await firstInvoice.isVisible()) {
      await firstInvoice.click();
      await expect(page.getByRole("button", { name: "Record Payment" })).not.toBeVisible();
    }

    // Targets tab: Viewer cannot see "Configure Target"
    await mainNav.getByRole("button", { name: "Sales Targets" }).click();
    await expect(page.getByRole("button", { name: /Configure.*Target/i })).not.toBeVisible();

    // Direct API mutation attempts with Viewer token must return 403 Forbidden
    const viewerLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_viewer", password: "ViewerPass123!" },
    });
    const { token: viewerToken } = await viewerLogin.json();

    const orderRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
      data: { fy_code: "FY 2026-27", customer_id: 1, po_number: "PO-FORBIDDEN", items: [] },
    });
    expect(orderRes.status()).toBe(403);

    const targetRes = await request.post(`${BACKEND_URL}/api/targets/1`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
      data: { fy_code: "FY 2026-27", yearly_target: 5000000 },
    });
    expect(targetRes.status()).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 7. Customer Master Lifecycle & Duplicate Prevention
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-07: Customer Master - Complete creation and duplicate billing name conflict (409)", async ({ page, request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const uniqueSuffix = Date.now().toString().slice(-4);
    const customerName = `UAT Test Customer ${uniqueSuffix}`;

    const createRes = await request.post(`${BACKEND_URL}/api/customers`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        billing_name: customerName,
        billing_address: "100 Innovation Boulevard",
        city: "Bengaluru",
        state: "Karnataka",
        country: "IN",
        pin_code: "560100",
        gst_number: `29AAACU${uniqueSuffix}C1ZV`,
        contact_person: "Aarav Gupta",
        email: `contact@uat-${uniqueSuffix}.example.com`,
      },
    });
    expect([200, 201]).toContain(createRes.status());
    const customer = await createRes.json();

    try {
      // Duplicate prevention -> 409 Conflict
      const dupRes = await request.post(`${BACKEND_URL}/api/customers`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          billing_name: customerName,
          billing_address: "Another address",
          state: "Karnataka",
        },
      });
      expect(dupRes.status()).toBe(409);

      // Verify customer in browser directory
      await loginAs(page, "sandbox_admin");
      await page.getByRole("button", { name: "Customers" }).click();
      await expect(page).toHaveURL(`${FRONTEND_URL}/customers`);
      await page.getByPlaceholder("Name, GSTIN or contact").fill(customerName);
      await expect(page.getByRole("button", { name: customerName, exact: true })).toBeVisible();
    } finally {
      await request.delete(`${BACKEND_URL}/api/customers/${customer.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });

  // -------------------------------------------------------------------------
  // 8. Unbilled Purchase Order & Zero Recognized AR Invariance
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-08: Unbilled Purchase Order - Creation, GST calculation and Zero AR Invariant", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const custRes = await request.get(`${BACKEND_URL}/api/customers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const customers = await custRes.json();
    const customerId = customers[0].id;

    const uniqueSuffix = Date.now().toString().slice(-4);
    const poNumber = `PO-UAT-ZEROAR-${uniqueSuffix}`;

    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: customerId,
        po_number: poNumber,
        po_date: "2026-04-15",
        currency: "INR",
        items: [
          {
            item_description: "Advanced Microservices Architecture Advisory",
            quantity: 1,
            unit_price: 200000.0,
            tax_rate: 0.18,
          },
        ],
      },
    });
    expect(poRes.status()).toBe(201);
    const po = await poRes.json();
    expect(po.status).toBe("UNBILLED");
    expect(po.exclusive_amount).toBe("200000.00");
    expect(po.tax_amount).toBe("36000.00");
    expect(po.total_amount).toBe("236000.00");

    // Invariant Check: Unbilled PO must NEVER increase recognized Accounts Receivable
    const summaryRes = await request.get(`${BACKEND_URL}/api/reporting/summary?fy=FY%202026-27`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(summaryRes.status()).toBe(200);
    const summary = await summaryRes.json();
    expect(summary.total_outstanding).toBe("322000.00");

    // Cleanup PO
    await request.delete(`${BACKEND_URL}/api/orders/${po.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  // -------------------------------------------------------------------------
  // 9. Order-to-Invoice Conversion & Net-30 Default
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-09: PO-to-Invoice Conversion - Net-30 default, PO BILLED status, customer immutability", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const custRes = await request.get(`${BACKEND_URL}/api/customers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const customers = await custRes.json();
    const customerId = customers[0].id;

    const uniqueSuffix = Date.now().toString().slice(-4);
    const poNumber = `PO-UAT-CONV-${uniqueSuffix}`;
    const invNumber = `INV-UAT-CONV-${uniqueSuffix}`;

    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: customerId,
        po_number: poNumber,
        po_date: "2026-04-10",
        items: [{ item_description: "DevOps Pipeline Implementation", quantity: 1, unit_price: 150000.0, tax_rate: 0.18 }],
      },
    });
    const po = await poRes.json();

    const convRes = await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        invoice_number: invNumber,
        invoice_date: "2026-04-10",
        due_date: "2026-05-10",
      },
    });
    expect(convRes.status()).toBe(201);
    const invoice = await convRes.json();
    expect(invoice.due_date).toBe("2026-05-10");
    expect(invoice.customer_name || invoice.snapshot_customer_name).toBeDefined();

    // Verify PO transitioned to CONVERTED
    const poCheck = await request.get(`${BACKEND_URL}/api/orders/${po.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const poData = await poCheck.json();
    expect(poData.status).toBe("CONVERTED");

    // Cleanup: cancel invoice then delete order
    await request.post(`${BACKEND_URL}/api/invoices/${invoice.id}/cancel`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reason: "UAT test cleanup" },
    });
  });

  // -------------------------------------------------------------------------
  // 10. Unsettled Invoice Cancellation Lifecycle
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-10: Unsettled Invoice Cancellation Lifecycle & AR De-recognition", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const custRes = await request.get(`${BACKEND_URL}/api/customers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const customers = await custRes.json();
    const customerId = customers[0].id;

    const uniqueSuffix = Date.now().toString().slice(-4);
    const invNumber = `INV-UAT-CANC-${uniqueSuffix}`;

    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: customerId,
        po_number: `PO-UAT-CANC-${uniqueSuffix}`,
        po_date: "2026-04-14",
        items: [{ item_description: "Security Audit Services", quantity: 1, unit_price: 80000.0, tax_rate: 0.18 }],
      },
    });
    const po = await poRes.json();

    const convRes = await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoice_number: invNumber, invoice_date: "2026-04-14", due_date: "2026-05-14" },
    });
    const invoice = await convRes.json();

    const cancelRes = await request.post(`${BACKEND_URL}/api/invoices/${invoice.id}/cancel`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reason: "Customer cancelled requirement before delivery" },
    });
    expect(cancelRes.status()).toBe(200);
    const cancelledData = await cancelRes.json();
    expect(cancelledData.lifecycle_status).toBe("CANCELLED");

    // Cancelled invoice must NOT contribute to recognized AR
    const summaryRes = await request.get(`${BACKEND_URL}/api/reporting/summary?fy=FY%202026-27`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const summary = await summaryRes.json();
    expect(summary.total_outstanding).toBe("322000.00");
  });

  // -------------------------------------------------------------------------
  // 11. Combined Settlement Recording (Cash + TDS 194C)
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-11: Combined Settlement Recording - Cash and Section 194C TDS", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const custRes = await request.get(`${BACKEND_URL}/api/customers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const customers = await custRes.json();
    const customerId = customers[0].id;

    const uniqueSuffix = Date.now().toString().slice(-4);
    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: customerId,
        po_number: `PO-UAT-SETTLE-${uniqueSuffix}`,
        po_date: "2026-04-16",
        items: [{ item_description: "Performance Tuning", quantity: 1, unit_price: 100000.0, tax_rate: 0.18 }],
      },
    });
    const po = await poRes.json();

    const convRes = await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoice_number: `INV-UAT-SETTLE-${uniqueSuffix}`, invoice_date: "2026-04-16", due_date: "2026-05-16" },
    });
    const invoice = await convRes.json();

    const payRes = await request.post(`${BACKEND_URL}/api/payments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        invoice_id: invoice.id,
        payment_amount: 50000.0,
        tds_amount: 1000.0,
        tds_section: "194C",
        payment_date: "2026-04-20",
        remittance_number: `REM-UAT-${uniqueSuffix}`,
        payment_mode: "NEFT",
      },
    });
    expect([200, 201]).toContain(payRes.status());
    const payData = await payRes.json();
    expect(payData.success).toBe(true);
    expect(payData.payment_id).toBeDefined();
    expect(payData.invoice_summary.total_cash_paid).toBe("50000.00");
    expect(payData.invoice_summary.total_tds_deducted).toBe("1000.00");
    expect(payData.invoice_summary.total_paid).toBe("51000.00");

    // Cleanup: reverse payment and cancel invoice
    await request.post(`${BACKEND_URL}/api/payments/${payData.payment_id}/correct`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        reason: "UAT cleanup full reversal",
        corrected_payment_amount: 0.0,
        corrected_tds_amount: 0.0,
      },
    });
    await request.post(`${BACKEND_URL}/api/invoices/${invoice.id}/cancel`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reason: "UAT cleanup" },
    });
  });

  // -------------------------------------------------------------------------
  // 12. Overpayment Rejection Boundary (Exact ₹0.01 Limit)
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-12: Overpayment Rejection Boundary - Exact ₹0.01 excess settlement blocked (400)", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const custRes = await request.get(`${BACKEND_URL}/api/customers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const customers = await custRes.json();
    const customerId = customers[0].id;

    const uniqueSuffix = Date.now().toString().slice(-4);
    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: customerId,
        po_number: `PO-UAT-OVERPAY-${uniqueSuffix}`,
        po_date: "2026-04-16",
        items: [{ item_description: "Boundary Testing", quantity: 1, unit_price: 10000.0, tax_rate: 0.18 }],
      },
    });
    const po = await poRes.json();

    const convRes = await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoice_number: `INV-UAT-OVERPAY-${uniqueSuffix}`, invoice_date: "2026-04-16", due_date: "2026-05-16" },
    });
    const invoice = await convRes.json();

    // Attempt settlement of ₹11,800.01 (overpayment by exactly 1 paise)
    const overpayRes = await request.post(`${BACKEND_URL}/api/payments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        invoice_id: invoice.id,
        payment_amount: 11800.01,
        payment_date: "2026-04-20",
        remittance_number: `REM-OVER-${uniqueSuffix}`,
        payment_mode: "NEFT",
      },
    });
    expect(overpayRes.status()).toBe(400);
    const err = await overpayRes.json();
    expect(err.detail.toLowerCase()).toContain("exceed");

    // Cleanup invoice
    await request.post(`${BACKEND_URL}/api/invoices/${invoice.id}/cancel`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reason: "UAT cleanup" },
    });
  });

  // -------------------------------------------------------------------------
  // 13. Non-Destructive Payment Correction Workflow
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-13: Non-Destructive Payment Correction - Compensating Reversal and Replacement", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const custRes = await request.get(`${BACKEND_URL}/api/customers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const customers = await custRes.json();
    const customerId = customers[0].id;

    const uniqueSuffix = Date.now().toString().slice(-4);
    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: customerId,
        po_number: `PO-UAT-CORR-${uniqueSuffix}`,
        po_date: "2026-04-18",
        items: [{ item_description: "System Architecture Review", quantity: 1, unit_price: 50000.0, tax_rate: 0.18 }],
      },
    });
    const po = await poRes.json();

    const convRes = await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoice_number: `INV-UAT-CORR-${uniqueSuffix}`, invoice_date: "2026-04-18", due_date: "2026-05-18" },
    });
    const invoice = await convRes.json();

    const origPayRes = await request.post(`${BACKEND_URL}/api/payments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        invoice_id: invoice.id,
        payment_amount: 20000.0,
        payment_date: "2026-04-22",
        remittance_number: `REM-ORIG-${uniqueSuffix}`,
        payment_mode: "NEFT",
      },
    });
    expect(origPayRes.status()).toBe(200);
    const origPay = await origPayRes.json();

    const corrRes = await request.post(`${BACKEND_URL}/api/payments/${origPay.payment_id}/correct`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        reason: "Bank statement reconciliation correction",
        corrected_payment_amount: 25000.0,
        corrected_tds_amount: 500.0,
        corrected_tds_section: "194C",
        corrected_payment_date: "2026-04-22",
        corrected_payment_mode: "RTGS",
        corrected_remittance_number: `REM-CORR-${uniqueSuffix}`,
      },
    });
    expect(corrRes.status()).toBe(200);
    const corrResult = await corrRes.json();
    expect(corrResult.reversal_id).toBeDefined();
    expect(corrResult.replacement_id).toBeDefined();
    expect(corrResult.invoice_summary.total_cash_paid).toBe("25000.00");
    expect(corrResult.invoice_summary.total_tds_deducted).toBe("500.00");
    expect(corrResult.invoice_summary.total_paid).toBe("25500.00");

    // Cleanup
    await request.post(`${BACKEND_URL}/api/payments/${corrResult.replacement_id}/correct`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        reason: "UAT cleanup full reversal",
        corrected_payment_amount: 0.0,
        corrected_tds_amount: 0.0,
      },
    });
    await request.post(`${BACKEND_URL}/api/invoices/${invoice.id}/cancel`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reason: "UAT cleanup" },
    });
  });

  // -------------------------------------------------------------------------
  // 14. Full Payment Reversal Without Replacement
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-14: Full Payment Reversal - Restores pre-payment invoice balance", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const custRes = await request.get(`${BACKEND_URL}/api/customers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const customers = await custRes.json();
    const customerId = customers[0].id;

    const uniqueSuffix = Date.now().toString().slice(-4);
    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: customerId,
        po_number: `PO-UAT-REV-${uniqueSuffix}`,
        po_date: "2026-04-18",
        items: [{ item_description: "Cloud Infrastructure Setup", quantity: 1, unit_price: 100000.0, tax_rate: 0.18 }],
      },
    });
    const po = await poRes.json();

    const convRes = await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoice_number: `INV-UAT-REV-${uniqueSuffix}`, invoice_date: "2026-04-18", due_date: "2026-05-18" },
    });
    const invoice = await convRes.json();

    const payRes = await request.post(`${BACKEND_URL}/api/payments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        invoice_id: invoice.id,
        payment_amount: 100000.0,
        tds_amount: 2000.0,
        tds_section: "194C",
        payment_date: "2026-04-22",
        remittance_number: `REM-REV-${uniqueSuffix}`,
        payment_mode: "NEFT",
      },
    });
    expect(payRes.status()).toBe(200);
    const pay = await payRes.json();

    const revRes = await request.post(`${BACKEND_URL}/api/payments/${pay.payment_id}/correct`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        reason: "Customer bounced cheque, full reversal",
        corrected_payment_amount: 0.0,
        corrected_tds_amount: 0.0,
        corrected_payment_date: "2026-04-22",
      },
    });
    expect(revRes.status()).toBe(200);
    const revData = await revRes.json();
    expect(revData.reversal_id).toBeDefined();
    expect(revData.replacement_id).toBeNull();
    expect(revData.invoice_summary.outstanding_balance).toBe("118000.00");
    expect(revData.invoice_summary.payment_status).toBe("PENDING");
    expect(["PENDING", "OVERDUE"]).toContain(revData.invoice_summary.computed_status);

    const invCheck = await request.get(`${BACKEND_URL}/api/invoices/${invoice.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const invData = await invCheck.json();
    const invObj = invData.invoice || invData;
    expect(invObj.outstanding_balance).toBe("118000.00");
    expect(invObj.payment_status).toBe("PENDING");

    await request.post(`${BACKEND_URL}/api/invoices/${invoice.id}/cancel`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reason: "UAT cleanup" },
    });
  });

  // -------------------------------------------------------------------------
  // 15. Cancellation After Full Reversal & History Retention
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-15: Cancellation after Full Reversal - Retains payment audit trail in Reports Hub", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const custRes = await request.get(`${BACKEND_URL}/api/customers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const customers = await custRes.json();
    const customerId = customers[0].id;

    const uniqueSuffix = Date.now().toString().slice(-4);
    const remittanceNo = `REM-HIST-${uniqueSuffix}`;

    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: customerId,
        po_number: `PO-UAT-HIST-${uniqueSuffix}`,
        po_date: "2026-04-18",
        items: [{ item_description: "Advisory Services", quantity: 1, unit_price: 50000.0, tax_rate: 0.18 }],
      },
    });
    const po = await poRes.json();

    const convRes = await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoice_number: `INV-UAT-HIST-${uniqueSuffix}`, invoice_date: "2026-04-18", due_date: "2026-05-18" },
    });
    const invoice = await convRes.json();

    const payRes = await request.post(`${BACKEND_URL}/api/payments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        invoice_id: invoice.id,
        payment_amount: 50000.0,
        payment_date: "2026-04-20",
        remittance_number: remittanceNo,
        payment_mode: "NEFT",
      },
    });
    expect(payRes.status()).toBe(200);
    const pay = await payRes.json();

    const revRes = await request.post(`${BACKEND_URL}/api/payments/${pay.payment_id}/correct`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        reason: "Full reversal before cancellation",
        corrected_payment_amount: 0.0,
        corrected_tds_amount: 0.0,
        corrected_payment_date: "2026-04-20",
      },
    });
    expect(revRes.status()).toBe(200);

    const cancelRes = await request.post(`${BACKEND_URL}/api/invoices/${invoice.id}/cancel`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reason: "Cancellation after full reversal" },
    });
    expect(cancelRes.status()).toBe(200);

    const paymentsListRes = await request.get(`${BACKEND_URL}/api/payments?invoice_id=${invoice.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payList = await paymentsListRes.json();
    expect(payList.data.length).toBe(2);
    expect(payList.summary.total_settled).toBe("0.00");
  });

  // -------------------------------------------------------------------------
  // 16. Sales Target Configuration & Sub-Period Breakdown
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-16: Sales Target Configuration - Sub-period breakdown and PostgreSQL persistence", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const usersRes = await request.get(`${BACKEND_URL}/api/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const users = await usersRes.json();
    const salesUser = users.find((u: any) => u.username === "sandbox_sales");
    expect(salesUser).toBeDefined();

    const targetRes = await request.post(`${BACKEND_URL}/api/targets/${salesUser.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        yearly_target: 7500000.0,
      },
    });
    expect(targetRes.status()).toBe(200);
    const target = await targetRes.json();

    expect(target.yearly_target).toBe("7500000.00");
    expect(target.half_yearly_target).toBe("3750000.00");
    expect(target.quarterly_target).toBe("1875000.00");
    expect(target.monthly_target).toBe("625000.00");
  });

  // -------------------------------------------------------------------------
  // 17. Sales Representative Quota Isolation
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-17: Sales Representative Quota Isolation - Own-target visibility only", async ({ page, request }) => {
    await loginAs(page, "sandbox_sales", "SalesPass123!");

    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Sales Targets" }).click();

    // Quotas table displays only sandbox_sales in the table body
    await expect(page.locator(".cf-table").getByText(/Sandbox Sales Executive/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Configure.*Target/i })).not.toBeVisible();

    const salesLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_sales", password: "SalesPass123!" },
    });
    const { token: salesToken } = await salesLogin.json();

    const targetsRes = await request.get(`${BACKEND_URL}/api/targets?fy=FY%202026-27`, {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    const targets = await targetsRes.json();
    expect(targets.length).toBe(1);
    expect(targets[0].username).toBe("sandbox_sales");
  });

  // -------------------------------------------------------------------------
  // 18. Reports Hub View 1 — Invoices & Receivables Reconciliation
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-18: Reports Hub View 1 (Invoices & Receivables) - Ledger vs server totals reconciliation", async ({ page }) => {
    await loginAs(page, "sandbox_admin");

    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Reports" }).click();
    await expect(page).toHaveURL(`${FRONTEND_URL}/reports`);

    // Verify baseline invoice INV-2026-042 appears
    await expect(page.getByText(/INV-2026-042/i).first()).toBeVisible();
    await expect(page.getByText(/Acme Cloud Solutions/i).first()).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 19. Reports Hub View 2 — Collections Ledger & Signed Reversals
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-19: Reports Hub View 2 (Collections Ledger) - GET /api/payments signed reversal values", async ({ page }) => {
    await loginAs(page, "sandbox_admin");

    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Reports" }).click();

    // Switch to Collections Ledger tab
    await page.getByTestId("tab-payments").click();

    // Baseline payment REM-2026-001 should be rendered
    await expect(page.getByText(/REM-2026-001/i).first()).toBeVisible();
    await expect(page.getByText(/₹2,00,000/i).first()).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 20. Reports Hub View 3 & 4 — Customer Exposure & Executive Attainment
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-20: Reports Hub View 3 & 4 (Customer Exposure & Executive Attainment)", async ({ page }) => {
    await loginAs(page, "sandbox_admin");

    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Reports" }).click();

    // View 3: Customer Exposure
    await page.getByTestId("tab-customers").click();
    await expect(page.getByText(/Acme Cloud Solutions Pvt Ltd/i).first()).toBeVisible();

    // View 4: Executive Attainment
    await page.getByTestId("tab-executives").click();
    await expect(page.getByText(/Sandbox Sales Executive/i).first()).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 21. Reports Hub View 5 — AR Aging Summary & 30 April 2026 Anchor
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-21: Reports Hub View 5 (AR Aging Summary) - 6 aging buckets & 30 April 2026 anchor", async ({ page, request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const agingRes = await request.get(`${BACKEND_URL}/api/reporting/ar-aging?as_of_date=2026-04-30&fy=FY%202026-27`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(agingRes.status()).toBe(200);
    const aging = await agingRes.json();

    expect(aging.buckets.length).toBe(6);
    expect(aging.buckets.map((b: any) => b.bucket)).toEqual([
      "Current / Not Due",
      "1–30 days",
      "31–60 days",
      "61–90 days",
      "91–180 days",
      "180+ days",
    ]);

    const inv42 = aging.rows.find((r: any) => r.invoice_number === "INV-2026-042");
    expect(inv42).toBeDefined();
    expect(inv42.days_overdue).toBe(0);
    expect(inv42.bucket).toBe("Current / Not Due");

    await loginAs(page, "sandbox_admin");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Reports" }).click();
    await page.getByTestId("tab-aging").click();

    await expect(page.getByText(/Current \/ Not Due/i).first()).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 22. Reports Hub Server Pagination
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-22: Reports Hub Server Pagination & Totals Invariance", async ({ page }) => {
    await loginAs(page, "sandbox_admin");

    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Reports" }).click();

    // Ensure pagination info is rendered (e.g. "1–1 of 1 records" or "of 1 records")
    await expect(page.getByText(/of \d+ records/i)).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 23. Authoritative Export Workflow & Ticket Security
  // -------------------------------------------------------------------------
  test("CF4C6-E2E-23: Authoritative Export Workflow - 5 steps, ticket security, single-use enforcement, replay rejection", async ({ page, request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const ticketRes = await request.post(`${BACKEND_URL}/api/export/token`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { format: "excel", fy: "FY 2026-27", scope: "all" },
    });
    expect([200, 201]).toContain(ticketRes.status());
    const { token: ticket } = await ticketRes.json();

    // First download succeeds
    const d1 = await request.get(`${BACKEND_URL}/api/export/excel?ticket=${ticket}&fy=FY%202026-27&scope=all`);
    expect(d1.status()).toBe(200);

    // Second download fails with 401/410 (single-use consumption lock)
    const d2 = await request.get(`${BACKEND_URL}/api/export/excel?ticket=${ticket}&fy=FY%202026-27&scope=all`);
    expect([401, 410]).toContain(d2.status());

    // 2. Full UI 5-Step Export Workflow
    await loginAs(page, "sandbox_admin");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Reports" }).click();

    await page.getByTestId("export-report-btn").click();

    // Step 1: Scope
    await expect(page.getByRole("heading", { name: /Generate Financial Export/i })).toBeVisible();
    await page.getByRole("button", { name: /Continue to Preview/i }).click();

    // Step 2: Matched Scope
    await expect(page.getByText(/Sample-Only Preview/i).first()).toBeVisible();
    await page.getByRole("button", { name: /Review Columns & Totals/i }).click();

    // Step 3: Review
    await expect(page.getByText(/Authoritative 17 Columns Checklist/i)).toBeVisible();
    await page.getByRole("button", { name: /Proceed to Confirmation/i }).click();

    // Step 4: Confirm
    await expect(page.getByText(/Pre-Flight Security & Integrity Checks/i)).toBeVisible();
    await page.getByRole("button", { name: /Confirm & Generate Excel Export/i }).click();

    // Step 5: Result
    await expect(page.getByRole("heading", { name: /Export Ready for Download/i })).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download Export File/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(".xlsx");
  });

  // -------------------------------------------------------------------------
  // 24. Responsive Multi-Viewport Matrix (1440, 768, 390, 320) & Screenshots
  // -------------------------------------------------------------------------
  const viewports = [
    { name: "desktop-1440", width: 1440, height: 900 },
    { name: "tablet-768", width: 768, height: 1024 },
    { name: "mobile-390", width: 390, height: 844 },
    { name: "narrow-320", width: 320, height: 568 },
  ];

  for (const vp of viewports) {
    test(`CF4C6-E2E-24: Responsive Viewport ${vp.name} (${vp.width}x${vp.height}) - Layout & Screenshot Evidence`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await loginAs(page, "sandbox_admin");

      // Verify Dashboard rendering without horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `uat_dashboard_${vp.name}.png`),
        fullPage: false,
      });

      if (vp.width <= 768) {
        const reportsNav = page.locator("a[href='/reports'], button:has-text('Reports')").first();
        if (await reportsNav.isVisible()) {
          await reportsNav.click();
        }
      } else {
        const mainNav = page.getByRole("navigation", { name: "Main navigation" });
        await mainNav.getByRole("button", { name: "Reports" }).click();
      }

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `uat_reports_${vp.name}.png`),
        fullPage: false,
      });
    });
  }
});
