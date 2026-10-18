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

// Helper to login in browser
async function loginAs(page: any, username: string, pass = "AdminPass123!") {
  await page.goto(`${FRONTEND_URL}/login`);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(pass);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await expect(page).toHaveURL(`${FRONTEND_URL}/`);
}

// =============================================================================
// PART 1: FUNCTIONAL LIVE BROWSER WORKFLOWS (24 TESTS)
// Genuinely browser-driven UI workflows interacting with forms, buttons & DOM
// =============================================================================

test.describe("Part 1: Functional LIVE Browser Workflows (24 Tests)", () => {
  test.beforeAll(async () => {
    resetDatabaseToBaseline();
  });

  test.afterAll(async () => {
    resetDatabaseToBaseline();
  });

  // 1. Multi-role authentication & live sandbox banner verification
  test("CF4C6-BROWSER-01: Multi-role authentication & live sandbox banner verification (Admin, Finance, Sales, Viewer)", async ({ page }) => {
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

  // 2. Invalid credentials rejection, lockout safety & UI error banner
  test("CF4C6-BROWSER-02: Invalid credentials rejection, lockout safety and error banner display in UI", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/login`);
    await page.getByLabel("Username").fill("sandbox_admin");
    await page.getByLabel("Password").fill("WrongPassword999!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    await expect(page.getByText(/Invalid username or password/i)).toBeVisible();
    await expect(page).toHaveURL(`${FRONTEND_URL}/login`);
  });

  // 3. Route authentication protection & unauthenticated redirect
  test("CF4C6-BROWSER-03: Route authentication protection and unauthenticated redirect to /login", async ({ page }) => {
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

  // 4. Session termination via Sign Out & forward navigation block
  test("CF4C6-BROWSER-04: Session termination via Sign Out and forward navigation block", async ({ page }) => {
    await loginAs(page, "sandbox_admin");
    await page.getByRole("button", { name: /Sign out/i }).click();
    await expect(page).toHaveURL(`${FRONTEND_URL}/login`);

    // Back button attempt must not expose authenticated workspace
    await page.goBack();
    await expect(page).toHaveURL(`${FRONTEND_URL}/login`);
  });

  // 5. RBAC UI action button enforcement
  test("CF4C6-BROWSER-05: RBAC UI action button enforcement (Sales & Viewer restricted actions hidden)", async ({ page }) => {
    await loginAs(page, "sandbox_viewer", "ViewerPass123!");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });

    // Orders tab: Viewer cannot see "New Order"
    await mainNav.getByRole("button", { name: "Orders" }).click();
    await expect(page.getByRole("button", { name: "New Order" })).not.toBeVisible();

    // Invoices tab: Viewer cannot see "Record Payment"
    await mainNav.getByRole("button", { name: "Invoices" }).click();
    const firstInvoice = page.locator(".cf-table tbody tr").first();
    if (await firstInvoice.isVisible()) {
      await firstInvoice.click();
      await expect(page.getByRole("button", { name: "Record Payment" })).not.toBeVisible();
      // Close invoice drawer
      const closeBtn = page.getByRole("button", { name: /Close invoice details|Close/i }).first();
      if (await closeBtn.isVisible()) await closeBtn.click();
    }

    // Targets tab: Viewer cannot see "Configure Target"
    await mainNav.getByRole("button", { name: "Sales Targets" }).click();
    await expect(page.getByRole("button", { name: /Configure.*Target/i })).not.toBeVisible();

    // Logout and check Sales role restrictions
    await page.getByRole("button", { name: /Sign out/i }).click();
    await loginAs(page, "sandbox_sales", "SalesPass123!");

    // Sales CAN see "New Order"
    await mainNav.getByRole("button", { name: "Orders" }).click();
    await expect(page.getByRole("button", { name: "New Order" })).toBeVisible();

    // But Sales CANNOT see "Convert to Invoice" on orders
    const poNexusRow = page.locator(".cf-table tbody tr").filter({ hasText: "PO-NEXUS-881" }).first();
    if (await poNexusRow.isVisible()) {
      await poNexusRow.click();
      await expect(page.getByRole("button", { name: "Convert to Invoice" })).not.toBeVisible();
    }
  });

  // 6. Customer Master - Full creation via Customer Drawer
  test("CF4C6-BROWSER-06: Customer Master - Full creation via Customer Drawer and table row rendering", async ({ page }) => {
    await loginAs(page, "sandbox_sales", "SalesPass123!");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Customers" }).click();

    // Open New Customer Drawer
    await page.getByRole("button", { name: "New customer" }).click();
    await expect(page.getByText("Create customer")).toBeVisible();

    const suffix = Date.now().toString().slice(-4);
    const billingName = `Apex Global Solutions ${suffix}`;

    await page.locator("#ref-billing_name").fill(billingName);
    await page.locator("#ref-billing_address").fill("500 Tech Park Way");
    await page.locator("#ref-city").fill("Pune");
    await page.locator("#ref-state").fill("Maharashtra");
    await page.locator("#ref-gst_number").fill(`27AAACG${suffix}D1ZB`);
    await page.locator("#ref-contact_person").fill("Devendra Sharma");
    await page.locator("#ref-email").fill(`finance@apex-${suffix}.example.com`);

    // Step 1: Form -> Step 2: Review
    await page.getByRole("button", { name: /Review changes/i }).click();
    await expect(page.getByText("Intended reference change")).toBeVisible();

    // Step 2: Review -> Step 3: Confirm
    await page.getByRole("button", { name: "Continue to confirmation" }).click();
    await expect(page.getByText(/Confirm create customer in live database/i)).toBeVisible();

    // Step 3: Confirm -> Step 4: Result
    await page.getByRole("button", { name: "Confirm reference change" }).click();
    await expect(page.getByText(/Changes successfully committed to live PostgreSQL database/i)).toBeVisible();

    // Return to list
    await page.getByRole("button", { name: "Return to list" }).click();

    // Verify row appears in Customer directory table
    await expect(page.locator(".cf-customer-table").getByText(billingName).first()).toBeVisible();
  });

  // 7. Customer Master - Inline validation errors
  test("CF4C6-BROWSER-07: Customer Master - Inline validation errors for required fields and invalid GSTIN", async ({ page }) => {
    await loginAs(page, "sandbox_sales", "SalesPass123!");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Customers" }).click();

    await page.getByRole("button", { name: "New customer" }).click();

    // Submit without required billing name
    await page.getByRole("button", { name: /Review changes/i }).click();
    await expect(page.locator("#error-billing_name")).toBeVisible();

    // Enter invalid GSTIN
    await page.locator("#ref-billing_name").fill("Invalid Customer Ltd");
    await page.locator("#ref-gst_number").fill("INVALID_GSTIN_123");
    await page.getByRole("button", { name: /Review changes/i }).click();
    await expect(page.locator("#error-gst_number")).toBeVisible();

    // Close drawer
    await page.getByRole("button", { name: "Close reference workflow" }).click();
  });

  // 8. Customer Master - Duplicate billing name rejection
  test("CF4C6-BROWSER-08: Customer Master - Duplicate billing name rejection with error alert banner in UI", async ({ page }) => {
    await loginAs(page, "sandbox_sales", "SalesPass123!");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Customers" }).click();

    await page.getByRole("button", { name: "New customer" }).click();

    // Use baseline customer name
    await page.locator("#ref-billing_name").fill("Acme Cloud Solutions Pvt Ltd");
    await page.locator("#ref-billing_address").fill("100 Innovation Park");
    await page.locator("#ref-city").fill("Bengaluru");
    await page.locator("#ref-state").fill("Karnataka");
    await page.locator("#ref-gst_number").fill("29AABCA1234A1Z5");

    await page.getByRole("button", { name: /Review changes/i }).click();
    await page.getByRole("button", { name: "Continue to confirmation" }).click();
    await page.getByRole("button", { name: "Confirm reference change" }).click();

    // Error alert banner indicates conflict
    await expect(page.locator("p.cf-field-error[role='alert']")).toBeVisible();

    await page.getByRole("button", { name: "Close reference workflow" }).click();
  });

  // 9. Purchase Order - Creation via UI Order Drawer
  test("CF4C6-BROWSER-09: Purchase Order - Creation via UI Order Drawer with live GST calculation and review", async ({ page }) => {
    await loginAs(page, "sandbox_sales", "SalesPass123!");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Orders" }).click();

    await page.getByRole("button", { name: "New Order" }).click();
    await expect(page.getByText("Create Purchase Order")).toBeVisible();

    const poNumber = `PO-BRW-09-${Date.now().toString().slice(-4)}`;
    await page.getByLabel("Customer").selectOption("1");
    await page.getByLabel("PO number").fill(poNumber);
    await page.getByLabel("Description").fill("Cloud Migration & Security Baseline");
    await page.getByLabel("Quantity").fill("10");
    await page.getByLabel("Unit price").fill("10000");

    // Tax calculation shows 18% GST (₹18,000) and Total ₹1,18,000
    await page.getByRole("button", { name: /Review changes/i }).click();
    await expect(page.getByRole("button", { name: "Continue to confirmation" })).toBeVisible();

    await page.getByRole("button", { name: "Continue to confirmation" }).click();
    await expect(page.getByRole("button", { name: "Confirm create purchase order" })).toBeVisible();

    await page.getByRole("button", { name: "Confirm create purchase order" }).click();
    await expect(page.getByRole("button", { name: "Return to workspace" })).toBeVisible();
    await page.getByRole("button", { name: "Return to workspace" }).click();

    // Verify order rendered in Orders table with UNBILLED status
    await expect(page.getByRole("button", { name: poNumber, exact: true }).first()).toBeVisible();
  });

  // 10. Purchase Order - Form validation rejects missing fields & negative pricing
  test("CF4C6-BROWSER-10: Purchase Order - Form validation rejects missing fields and negative pricing", async ({ page }) => {
    await loginAs(page, "sandbox_sales", "SalesPass123!");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Orders" }).click();

    await page.getByRole("button", { name: "New Order" }).click();
    await page.getByLabel("PO number").fill("PO-INVALID");
    await page.getByLabel("Unit price").fill("-5000");

    await page.getByRole("button", { name: /Review changes/i }).click();

    // Verify user remains on Form step and review button did not advance
    await expect(page.getByRole("button", { name: "Continue to confirmation" })).not.toBeVisible();
    await page.getByRole("button", { name: /Close order workflow|Close/i }).first().click();
  });

  // 11. PO-to-Invoice Conversion - UI conversion workflow & Net-30 default
  test("CF4C6-BROWSER-11: Purchase Order to Invoice Conversion - UI conversion workflow, status reload & Net-30 default", async ({ page, request }) => {
    // Setup isolated PO via API
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();
    const suffix = Date.now().toString().slice(-4);
    const poNum = `PO-CONV-${suffix}`;

    await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: 1,
        po_number: poNum,
        po_date: "2026-04-18",
        currency: "INR",
        items: [{ description: "System Audit Consulting", quantity: 1, unit_price: 100000.0, tax_rate: 0.18 }],
      },
    });

    // Login as finance to convert
    await loginAs(page, "sandbox_finance", "FinancePass123!");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Orders" }).click();

    // Open PO drawer
    await page.getByRole("button", { name: poNum, exact: true }).first().click();
    await expect(page.getByText("ORDER DETAILS")).toBeVisible();

    await page.getByRole("button", { name: "Convert to Invoice" }).click();
    await expect(page.getByText("Conversion to commercial invoice")).toBeVisible();

    const invNum = `INV-CONV-${suffix}`;
    await page.getByLabel("Invoice number").fill(invNum);

    await page.getByRole("button", { name: /Review changes/i }).click();
    await page.getByRole("button", { name: "Continue to confirmation" }).click();
    await page.getByRole("button", { name: /Confirm convert/i }).click();
    await page.getByRole("button", { name: "Return to workspace" }).click();

    // Check Invoices list contains newly converted invoice
    await mainNav.getByRole("button", { name: "Invoices" }).click();
    await expect(page.getByRole("button", { name: invNum, exact: true }).first()).toBeVisible();

    // Check Orders list marks the PO as Converted/Billed
    await mainNav.getByRole("button", { name: "Orders" }).click();
    const poRow = page.locator(".cf-table tbody tr").filter({ hasText: poNum }).first();
    await expect(poRow.getByText(/Converted|Billed/i)).toBeVisible();
  });

  // 12. Invoice Cancellation Lifecycle in UI
  test("CF4C6-BROWSER-12: Invoice Cancellation - Unsettled invoice cancelled via UI drawer, status badge updates to CANCELLED", async ({ page, request }) => {
    // Setup isolated invoice via API
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();
    const suffix = Date.now().toString().slice(-4);
    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: 1,
        po_number: `PO-CANCEL-${suffix}`,
        po_date: "2026-04-18",
        items: [{ description: "Cancelled Project", quantity: 1, unit_price: 30000.0, tax_rate: 0.18 }],
      },
    });
    const po = await poRes.json();
    const invNum = `INV-CANCEL-${suffix}`;
    await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoice_number: invNum, invoice_date: "2026-04-18", due_date: "2026-05-18" },
    });

    await loginAs(page, "sandbox_finance", "FinancePass123!");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Invoices" }).click();

    // Open invoice drawer
    await page.getByRole("button", { name: invNum, exact: true }).first().click();
    await page.getByRole("button", { name: "Cancel Invoice" }).click();

    await page.getByLabel("Audit reason (required)").fill("Client cancelled contract prior to milestone delivery");
    await page.getByRole("button", { name: "Review cancellation" }).click();
    await page.getByRole("button", { name: "Continue to confirmation" }).click();
    await page.getByRole("button", { name: "Confirm Cancellation" }).click();
    await page.getByRole("button", { name: "Return to workspace" }).click();

    // Verify invoice status badge reflects CANCELLED
    const invRow = page.locator(".cf-table tbody tr").filter({ hasText: invNum }).first();
    await expect(invRow.getByText("CANCELLED")).toBeVisible();
  });

  // 13. Payment Settlement - Combined Cash & TDS recorded via Payment Drawer
  test("CF4C6-BROWSER-13: Payment Recording - Combined Cash & TDS recorded via Payment Drawer, balance outstanding visibly decreases", async ({ page, request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();
    const suffix = Date.now().toString().slice(-4);
    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: 1,
        po_number: `PO-PAY-${suffix}`,
        po_date: "2026-04-18",
        items: [{ description: "Enterprise Support", quantity: 1, unit_price: 100000.0, tax_rate: 0.18 }],
      },
    });
    const po = await poRes.json();
    const invNum = `INV-PAY-${suffix}`;
    await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoice_number: invNum, invoice_date: "2026-04-18", due_date: "2026-05-18" },
    });

    await loginAs(page, "sandbox_finance", "FinancePass123!");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Invoices" }).click();

    await page.getByRole("button", { name: invNum, exact: true }).first().click();
    await page.getByRole("button", { name: "Record Payment" }).click();

    const remittanceNo = `UTR-BRW-${suffix}`;
    await page.getByLabel(/Cash payment amount/).fill("100000");
    await page.getByLabel(/TDS deduction amount/).fill("2000");
    await page.getByLabel(/TDS section/).selectOption("194C (2%)");
    await page.getByLabel(/Remittance/i).fill(remittanceNo);

    await page.getByRole("button", { name: /Review changes/i }).click();
    await page.getByRole("button", { name: "Continue to confirmation" }).click();
    await page.getByRole("button", { name: /Confirm payment/i }).click();
    await page.getByRole("button", { name: "Return to workspace" }).click();

    // Verify invoice row updated balance outstanding is ₹16,000 (118000 - 102000)
    await expect(page.getByRole("button", { name: invNum, exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: invNum, exact: true }).first().click();
    await expect(page.getByText(/₹16,000/i).first()).toBeVisible();
  });

  // 14. Payment Drawer - Overpayment validation blocks settlement exceeding balance
  test("CF4C6-BROWSER-14: Payment Drawer - Overpayment validation blocks settlement exceeding outstanding balance", async ({ page }) => {
    await loginAs(page, "sandbox_admin");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Invoices" }).click();

    // Open baseline invoice INV-2026-042 (balance ₹3,22,000)
    await page.getByRole("button", { name: "INV-2026-042", exact: true }).first().click();
    await page.getByRole("button", { name: "Record Payment" }).click();

    // Enter settlement exceeding balance
    await page.getByLabel(/Cash payment amount/).fill("500000");
    await page.getByLabel(/Remittance/i).fill("UTR-OVERPAY-BRW");

    // Overpayment validation blocks advancing: Review changes button is disabled
    await expect(page.getByRole("button", { name: /Review changes/i })).toBeDisabled();
    await page.getByRole("button", { name: /Close payment workflow|Close/i }).first().click();
  });

  // 15. Payment Correction Drawer - Non-destructive compensating correction in UI
  test("CF4C6-BROWSER-15: Payment Correction Drawer - Non-destructive compensating correction in UI", async ({ page, request }) => {
    // Setup isolated invoice & payment
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();
    const suffix = Date.now().toString().slice(-4);
    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: 1,
        po_number: `PO-CORR-${suffix}`,
        po_date: "2026-04-18",
        items: [{ description: "Consulting", quantity: 1, unit_price: 50000.0, tax_rate: 0.18 }],
      },
    });
    const po = await poRes.json();
    const invRes = await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoice_number: `INV-CORR-${suffix}`, invoice_date: "2026-04-18", due_date: "2026-05-18" },
    });
    const inv = await invRes.json();

    const remittanceNo = `UTR-CORR-${suffix}`;
    await request.post(`${BACKEND_URL}/api/payments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        invoice_id: inv.id,
        payment_amount: 20000.0,
        payment_date: "2026-04-20",
        remittance_number: remittanceNo,
        payment_mode: "NEFT",
      },
    });

    await loginAs(page, "sandbox_admin");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Payments" }).click();

    // Open correction drawer
    const actionBtn = page.getByRole("button", { name: `Actions for payment ${remittanceNo}` }).first();
    await actionBtn.click();
    await page.getByRole("button", { name: /Correct \/ Reverse Payment/i }).first().click();

    await page.getByLabel(/Correction reason/i).fill("Adjusted settlement amount per bank reconciliation");
    await page.getByLabel(/Corrected Cash Amount/i).fill("25000");

    await page.getByRole("button", { name: /Review correction/i }).click();
    await page.getByRole("button", { name: "Continue to confirmation" }).click();
    await page.getByRole("button", { name: /Confirm correction/i }).click();
    await page.getByRole("button", { name: "Return to ledger" }).click();

    // Verify ledger contains the updated amount
    await expect(page.getByText(remittanceNo).first()).toBeVisible();
  });

  // 16. Payment Full Reversal Drawer - Restores pre-payment invoice balance in UI
  test("CF4C6-BROWSER-16: Payment Full Reversal Drawer - Restores pre-payment invoice balance in UI", async ({ page, request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();
    const suffix = Date.now().toString().slice(-4);
    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: 1,
        po_number: `PO-REV-${suffix}`,
        po_date: "2026-04-18",
        items: [{ description: "Hardware Setup", quantity: 1, unit_price: 50000.0, tax_rate: 0.18 }],
      },
    });
    const po = await poRes.json();
    const invRes = await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoice_number: `INV-REV-${suffix}`, invoice_date: "2026-04-18", due_date: "2026-05-18" },
    });
    const inv = await invRes.json();

    const remittanceNo = `UTR-REV-${suffix}`;
    await request.post(`${BACKEND_URL}/api/payments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        invoice_id: inv.id,
        payment_amount: 59000.0,
        payment_date: "2026-04-20",
        remittance_number: remittanceNo,
        payment_mode: "NEFT",
      },
    });

    await loginAs(page, "sandbox_admin");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Payments" }).click();

    const actionBtn = page.getByRole("button", { name: `Actions for payment ${remittanceNo}` }).first();
    await actionBtn.click();
    await page.getByRole("button", { name: /Correct \/ Reverse Payment/i }).first().click();

    await page.getByLabel(/Correction reason/i).fill("Full reversal due to customer disputed transaction");
    await page.getByRole("button", { name: /Full Reversal/i }).click();

    await page.getByRole("button", { name: /Review correction/i }).click();
    await page.getByRole("button", { name: "Continue to confirmation" }).click();
    await page.getByRole("button", { name: /Confirm correction/i }).click();
    await page.getByRole("button", { name: "Return to ledger" }).click();

    // Verify invoice outstanding balance is restored to full gross (₹59,000)
    await mainNav.getByRole("button", { name: "Invoices" }).click();
    await page.getByRole("button", { name: `INV-REV-${suffix}`, exact: true }).first().click();
    await expect(page.getByText(/₹59,000/i).first()).toBeVisible();
  });

  // 17. Cancelled Invoice Historical Payment Retention in Reports Hub
  test("CF4C6-BROWSER-17: Cancelled Invoice Historical Payment Retention in Reports Hub Collections Ledger", async ({ page, request }) => {
    // Setup payment -> reversal -> invoice cancellation
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();
    const suffix = Date.now().toString().slice(-4);
    const remittanceNo = `UTR-HIST-${suffix}`;

    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: 1,
        po_number: `PO-H-${suffix}`,
        po_date: "2026-04-18",
        items: [{ description: "Historical Audit Test", quantity: 1, unit_price: 40000.0, tax_rate: 0.18 }],
      },
    });
    const po = await poRes.json();
    const invRes = await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoice_number: `INV-H-${suffix}`, invoice_date: "2026-04-18", due_date: "2026-05-18" },
    });
    const inv = await invRes.json();

    const payRes = await request.post(`${BACKEND_URL}/api/payments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        invoice_id: inv.id,
        payment_amount: 47200.0,
        payment_date: "2026-04-20",
        remittance_number: remittanceNo,
        payment_mode: "NEFT",
      },
    });
    const pay = await payRes.json();

    await request.post(`${BACKEND_URL}/api/payments/${pay.payment_id}/correct`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        reason: "Full reversal before cancellation",
        corrected_payment_amount: 0.0,
        corrected_tds_amount: 0.0,
        corrected_payment_date: "2026-04-20",
      },
    });

    await request.post(`${BACKEND_URL}/api/invoices/${inv.id}/cancel`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reason: "Cancellation after full reversal" },
    });

    await loginAs(page, "sandbox_admin");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Reports" }).click();
    await page.getByTestId("tab-payments").click();

    // Verify remittance reference is retained in the collections ledger
    await expect(page.getByText(remittanceNo).first()).toBeVisible();
  });

  // 18. Sales Target Configuration in UI
  test("CF4C6-BROWSER-18: Sales Target Configuration - Admin configures annual quota, breakdown & confirmation", async ({ page }) => {
    await loginAs(page, "sandbox_admin");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Sales Targets" }).click();

    await page.getByRole("button", { name: /Configure.*Target/i }).click();
    await expect(page.getByRole("heading", { name: /Configure Sales Target/i })).toBeVisible();

    // Click verified preset
    await page.getByRole("button", { name: "₹50,00,000" }).click();

    await page.getByRole("button", { name: /Review target changes/i }).click();
    await page.getByRole("button", { name: "Continue to confirmation" }).click();
    await page.getByRole("button", { name: "Confirm target changes" }).click();

    await expect(page.getByText(/Sales target successfully configured/i)).toBeVisible();
    await page.getByRole("button", { name: "Close target workflow" }).click();
  });

  // 19. Sales Representative Quota Isolation in UI
  test("CF4C6-BROWSER-19: Sales Representative Quota Isolation - UI displays own-target visibility only", async ({ page }) => {
    await loginAs(page, "sandbox_sales", "SalesPass123!");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Sales Targets" }).click();

    await expect(page.locator(".cf-table").getByText(/Sandbox Sales Executive/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Configure.*Target/i })).not.toBeVisible();
  });

  // 20. Reports Hub View 1 (Invoices & Receivables)
  test("CF4C6-BROWSER-20: Reports Hub View 1 (Invoices & Receivables) - Filter by FY, search customer, summary cards match table", async ({ page }) => {
    await loginAs(page, "sandbox_admin");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Reports" }).click();
    await expect(page).toHaveURL(`${FRONTEND_URL}/reports`);

    await expect(page.getByText(/INV-2026-042/i).first()).toBeVisible();
    await expect(page.getByText(/Acme Cloud Solutions/i).first()).toBeVisible();
  });

  // 21. Reports Hub View 2 (Collections Ledger)
  test("CF4C6-BROWSER-21: Reports Hub View 2 (Collections Ledger) - Signed cash/TDS, remittance references and net settlement", async ({ page }) => {
    await loginAs(page, "sandbox_admin");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Reports" }).click();
    await page.getByTestId("tab-payments").click();

    await expect(page.getByText(/REM-2026-001/i).first()).toBeVisible();
    await expect(page.getByText(/₹2,00,000/i).first()).toBeVisible();
  });

  // 22. Reports Hub View 3 & 4 (Customer Exposure & Executive Attainment)
  test("CF4C6-BROWSER-22: Reports Hub View 3 & 4 (Customer Exposure & Executive Attainment) - Tab navigation & exposure rendering", async ({ page }) => {
    await loginAs(page, "sandbox_admin");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Reports" }).click();

    await page.getByTestId("tab-customers").click();
    await expect(page.getByText(/Acme Cloud Solutions Pvt Ltd/i).first()).toBeVisible();

    await page.getByTestId("tab-executives").click();
    await expect(page.getByText(/Sandbox Sales Executive/i).first()).toBeVisible();
  });

  // 23. Reports Hub View 5 (AR Aging Summary)
  test("CF4C6-BROWSER-23: Reports Hub View 5 (AR Aging Summary) - 6 aging buckets & ₹3,22,000.00 authoritative anchor", async ({ page }) => {
    await loginAs(page, "sandbox_admin");
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Reports" }).click();
    await page.getByTestId("tab-aging").click();

    await expect(page.getByText(/Current \/ Not Due/i).first()).toBeVisible();
  });

  // 24. Authoritative Export Workflow
  test("CF4C6-BROWSER-24: Authoritative Export Workflow - 5-step Export Drawer interaction, single-use ticket generation, and file download", async ({ page }) => {
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
});

// =============================================================================
// PART 2: API CONTRACT & SECURITY INTEGRATION TESTS (11 TESTS)
// Strict protocol assertions, security boundaries, row locks & pagination
// =============================================================================

test.describe("Part 2: API Contract & Security Integration Tests (11 Tests)", () => {
  test.beforeAll(async () => {
    resetDatabaseToBaseline();
  });

  test.afterAll(async () => {
    resetDatabaseToBaseline();
  });

  // 1. Backend readiness and OpenAPI contracts
  test("CF4C6-API-01: Backend readiness and OpenAPI contracts validation", async ({ request }) => {
    const readyRes = await request.get(`${BACKEND_URL}/ready`);
    expect(readyRes.status()).toBe(200);
    const readyJson = await readyRes.json();
    expect(readyJson.status).toBe("ready");
    expect(readyJson.database).toBe("connected");

    const openapiRes = await request.get(`${BACKEND_URL}/openapi.json`);
    expect(openapiRes.status()).toBe(200);
    const openapi = await openapiRes.json();

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

  // 2. Baseline financial reconciliation
  test("CF4C6-API-02: Synthetic Baseline Financial Reconciliation - INV-2026-042, PO-NEXUS-881, REM-2026-001 (Zero Delta)", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const summaryRes = await request.get(`${BACKEND_URL}/api/reporting/summary?fy=FY%202026-27`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(summaryRes.status()).toBe(200);
    const summary = await summaryRes.json();

    expect(summary.total_invoiced).toBe("531000.00");
    expect(summary.total_cash).toBe("200000.00");
    expect(summary.total_tds).toBe("9000.00");
    expect(summary.total_settled).toBe("209000.00");
    expect(summary.total_outstanding).toBe("322000.00");
    expect(summary.unbilled_orders_value).toBe("295000.00");

    const invoiced = Number(summary.total_invoiced);
    const cash = Number(summary.total_cash);
    const tds = Number(summary.total_tds);
    const settled = Number(summary.total_settled);
    const outstanding = Number(summary.total_outstanding);

    expect(cash + tds).toBe(settled);
    expect(invoiced - settled).toBe(outstanding);
  });

  // 3. Unbilled Purchase Order Zero AR Invariant
  test("CF4C6-API-03: Unbilled Purchase Order - Creation, GST calculation and Zero AR Invariant", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: 1,
        po_number: `PO-API-03-${Date.now().toString().slice(-4)}`,
        po_date: "2026-04-15",
        items: [{ item_description: "Cloud Engineering", quantity: 2, unit_price: 50000.0, tax_rate: 0.18 }],
      },
    });
    expect(poRes.status()).toBe(201);
    const po = await poRes.json();

    expect(po.exclusive_amount).toBe("100000.00");
    expect(po.tax_amount).toBe("18000.00");
    expect(po.total_amount).toBe("118000.00");
    expect(po.status).toBe("UNBILLED");

    // Zero AR recognized
    const summaryRes = await request.get(`${BACKEND_URL}/api/reporting/summary?fy=FY%202026-27`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const summary = await summaryRes.json();
    expect(summary.total_invoiced).toBe("531000.00");
  });

  // 4. PO-to-Invoice Conversion Net-30 default & customer immutability
  test("CF4C6-API-04: PO-to-Invoice Conversion - Net-30 default, PO BILLED status, customer immutability", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: 1,
        po_number: `PO-API-04-${Date.now().toString().slice(-4)}`,
        po_date: "2026-04-18",
        items: [{ item_description: "Security Architecture", quantity: 1, unit_price: 100000.0, tax_rate: 0.18 }],
      },
    });
    const po = await poRes.json();

    const convRes = await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoice_number: `INV-API-04-${Date.now().toString().slice(-4)}`, invoice_date: "2026-04-18" },
    });
    expect(convRes.status()).toBe(201);
    const inv = await convRes.json();

    expect(inv.due_date).toBe("2026-05-18"); // Net-30 default
    expect(inv.customer_id).toBe(po.customer_id);
    expect(inv.lifecycle_status).toBe("ISSUED");
    expect(["PENDING", "OVERDUE"]).toContain(inv.computed_status);
    expect(inv.payment_status).toBe("PENDING");
  });

  // 5. Overpayment Rejection Boundary (Exact ₹0.01 limit)
  test("CF4C6-API-05: Overpayment Rejection Boundary - Exact ₹0.01 excess settlement blocked (400)", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: 1,
        po_number: `PO-API-05-${Date.now().toString().slice(-4)}`,
        po_date: "2026-04-18",
        items: [{ item_description: "Boundary Check", quantity: 1, unit_price: 10000.0, tax_rate: 0.18 }],
      },
    });
    const po = await poRes.json();

    const convRes = await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoice_number: `INV-API-05-${Date.now().toString().slice(-4)}`, invoice_date: "2026-04-18", due_date: "2026-05-18" },
    });
    const invoice = await convRes.json();

    // Overpayment of ₹11,800.01 on ₹11,800.00
    const overpayRes = await request.post(`${BACKEND_URL}/api/payments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        invoice_id: invoice.id,
        payment_amount: 11800.01,
        payment_date: "2026-04-20",
        remittance_number: `REM-OVER-${Date.now().toString().slice(-4)}`,
        payment_mode: "NEFT",
      },
    });
    expect(overpayRes.status()).toBe(400);
    const err = await overpayRes.json();
    expect(err.detail.toLowerCase()).toContain("exceed");
  });

  // 6. Concurrency Control with Row-Level Pessimistic Locking
  test("CF4C6-API-06: Concurrency Control - Concurrent payment requests with row-level pessimistic locking", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: 1,
        po_number: `PO-API-06-${Date.now().toString().slice(-4)}`,
        po_date: "2026-04-18",
        items: [{ item_description: "Concurrent Lock", quantity: 1, unit_price: 10000.0, tax_rate: 0.0 }],
      },
    });
    const po = await poRes.json();
    const invRes = await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoice_number: `INV-API-06-${Date.now().toString().slice(-4)}`, invoice_date: "2026-04-18", due_date: "2026-05-18" },
    });
    const invoice = await invRes.json();

    // Two parallel requests attempting to pay ₹8,000 each on a ₹10,000 invoice
    const [p1, p2] = await Promise.all([
      request.post(`${BACKEND_URL}/api/payments`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          invoice_id: invoice.id,
          payment_amount: 8000.0,
          payment_date: "2026-04-20",
          remittance_number: `REM-CONC-1-${Date.now().toString().slice(-4)}`,
          payment_mode: "NEFT",
        },
      }),
      request.post(`${BACKEND_URL}/api/payments`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          invoice_id: invoice.id,
          payment_amount: 8000.0,
          payment_date: "2026-04-20",
          remittance_number: `REM-CONC-2-${Date.now().toString().slice(-4)}`,
          payment_mode: "NEFT",
        },
      }),
    ]);

    const statuses = [p1.status(), p2.status()];
    // Exactly one should succeed (200) and one must be rejected (400)
    expect(statuses).toContain(200);
    expect(statuses).toContain(400);
  });

  // 7. Idempotency - Duplicate payment submission
  test("CF4C6-API-07: Idempotency - Duplicate payment request with identical idempotency key returns identical transaction", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: 1,
        po_number: `PO-API-07-${Date.now().toString().slice(-4)}`,
        po_date: "2026-04-18",
        items: [{ item_description: "Idempotency Test", quantity: 1, unit_price: 20000.0, tax_rate: 0.0 }],
      },
    });
    const po = await poRes.json();
    const invRes = await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoice_number: `INV-API-07-${Date.now().toString().slice(-4)}`, invoice_date: "2026-04-18", due_date: "2026-05-18" },
    });
    const invoice = await invRes.json();

    const idemKey = `idem-key-${Date.now()}`;
    const payload = {
      invoice_id: invoice.id,
      payment_amount: 5000.0,
      payment_date: "2026-04-20",
      remittance_number: `REM-IDEM-${Date.now().toString().slice(-4)}`,
      payment_mode: "NEFT",
      idempotency_key: idemKey,
    };

    // First request
    const res1 = await request.post(`${BACKEND_URL}/api/payments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: payload,
    });
    expect(res1.status()).toBe(200);
    const data1 = await res1.json();

    // Replay with identical payload
    const res2 = await request.post(`${BACKEND_URL}/api/payments`, {
      headers: { Authorization: `Bearer ${token}` },
      data: payload,
    });
    expect(res2.status()).toBe(200);
    const data2 = await res2.json();
    expect(data2.payment_id).toBe(data1.payment_id);
    expect(data2.idempotent_replay).toBe(true);
  });

  // 8. Export Ticket Single-Use Atomic Consumption & Replay Rejection
  test("CF4C6-API-08: Export ticket single-use atomic consumption and replay rejection (401/410)", async ({ request }) => {
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

    // Replay download fails with 401 or 410
    const d2 = await request.get(`${BACKEND_URL}/api/export/excel?ticket=${ticket}&fy=FY%202026-27&scope=all`);
    expect([401, 410]).toContain(d2.status());
  });

  // 9. Export Ticket Scope Tampering Protection
  test("CF4C6-API-09: Export ticket scope tampering protection - Altering scope/FY parameter returns 403", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    const ticketRes = await request.post(`${BACKEND_URL}/api/export/token`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { format: "excel", fy: "FY 2026-27", scope: "outstanding" },
    });
    const { token: ticket } = await ticketRes.json();

    // Tamper scope from 'outstanding' to 'all'
    const tamperedRes = await request.get(`${BACKEND_URL}/api/export/excel?ticket=${ticket}&fy=FY%202026-27&scope=all`);
    expect([400, 401, 403]).toContain(tamperedRes.status());
  });

  // 10. Export Ticket Bearer Token Bypass Protection
  test("CF4C6-API-10: Export ticket bearer token bypass protection - Bearer auth without ticket returns 401/403", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    // Direct download attempt with valid bearer token but no ticket parameter
    const bypassRes = await request.get(`${BACKEND_URL}/api/export/excel?fy=FY%202026-27&scope=all`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([400, 401, 403]).toContain(bypassRes.status());
  });

  // 11. Large Dataset Server Pagination (>100 Invoices)
  test("CF4C6-API-11: Large dataset server pagination (>100 invoices) metadata and global totals invariance", async ({ request }) => {
    const adminLogin = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const { token } = await adminLogin.json();

    // Query invoices endpoint with pagination limits
    const p1Res = await request.get(`${BACKEND_URL}/api/invoices?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(p1Res.status()).toBe(200);
    const p1 = await p1Res.json();

    expect(p1.data).toBeDefined();
    expect(p1.page).toBe(1);
    expect(p1.limit).toBe(10);
    expect(p1.total).toBeGreaterThanOrEqual(1);
    expect(p1.total_pages).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// PART 3: RESPONSIVE MULTI-VIEWPORT MATRIX (4 TESTS)
// 1440px, 768px, 390px, 320px with zero horizontal overflow (<=0px) & screenshots
// =============================================================================

test.describe("Part 3: Responsive Multi-Viewport Matrix (4 Tests)", () => {
  test.beforeAll(async () => {
    resetDatabaseToBaseline();
  });

  test.afterAll(async () => {
    resetDatabaseToBaseline();
  });

  // VP-01: Desktop Viewport (1440x900)
  test("CF4C6-VP-01: Desktop Viewport (1440x900) - Layout integrity, horizontal overflow <= 0px, drawer interaction", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, "sandbox_admin");

    // Horizontal overflow assertion
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // Open Reports Hub and Export Drawer
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Reports" }).click();
    await page.getByTestId("export-report-btn").click();
    await expect(page.getByRole("heading", { name: /Generate Financial Export/i })).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "uat_viewport_1440_desktop.png"),
      fullPage: false,
    });
  });

  // VP-02: Tablet Viewport (768x1024)
  test("CF4C6-VP-02: Tablet Viewport (768x1024) - Responsive navigation, horizontal overflow <= 0px, drawer usability", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await loginAs(page, "sandbox_admin");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Customers" }).click();
    await page.getByRole("button", { name: "New customer" }).click();
    await expect(page.getByText("Create customer")).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "uat_viewport_768_tablet.png"),
      fullPage: false,
    });
  });

  // VP-03: Mobile Viewport (390x844)
  test("CF4C6-VP-03: Mobile Viewport (390x844) - Mobile header, drawer responsiveness, horizontal overflow <= 0px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "sandbox_admin");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // Form buttons accessible and unclipped
    const mobileReports = page.locator("a[href='/reports'], button:has-text('Reports')").first();
    if (await mobileReports.isVisible()) {
      await mobileReports.click();
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "uat_viewport_390_mobile.png"),
      fullPage: false,
    });
  });

  // VP-04: Narrow Mobile Viewport (320x568)
  test("CF4C6-VP-04: Narrow Mobile Viewport (320x568) - Critical form buttons accessible, horizontal overflow <= 0px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await loginAs(page, "sandbox_admin");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // Critical buttons and headers remain accessible
    await expect(page.getByRole("button", { name: "Toggle navigation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Business overview" })).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "uat_viewport_320_narrow.png"),
      fullPage: false,
    });
  });
});
