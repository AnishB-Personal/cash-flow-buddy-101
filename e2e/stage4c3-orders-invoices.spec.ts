import { test, expect } from "@playwright/test";

const FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || "http://127.0.0.1:8000";

test.describe("Stage 4C.3: LIVE Orders, Invoices & Conversion Engine E2E", () => {
  test("CF4C3-01: Backend readiness check confirms orders and invoices endpoints", async ({ request }) => {
    const readyRes = await request.get(`${BACKEND_URL}/ready`);
    expect(readyRes.status()).toBe(200);
    const readyJson = await readyRes.json();
    expect(readyJson.status).toBe("ready");
    expect(readyJson.database).toBe("connected");

    const openapiRes = await request.get(`${BACKEND_URL}/openapi.json`);
    expect(openapiRes.status()).toBe(200);
    const openapi = await openapiRes.json();
    expect(openapi.paths["/api/orders"]).toBeDefined();
    expect(openapi.paths["/api/orders/{id}/convert"]).toBeDefined();
    expect(openapi.paths["/api/invoices"]).toBeDefined();
    expect(openapi.paths["/api/invoices/{invoice_id}/cancel"]).toBeDefined();
  });

  test("CF4C3-02: RBAC - sandbox_viewer cannot see 'New Order' button in LIVE mode", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/login`);
    await page.getByLabel("Username").fill("sandbox_viewer");
    await page.getByLabel("Password").fill("ViewerPass123!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    await expect(page).toHaveURL(`${FRONTEND_URL}/`);
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Orders" }).click();
    await expect(page.getByRole("button", { name: "New Order" })).not.toBeVisible();
  });

  test("CF4C3-03: Full Order-to-Invoice and Cancellation Lifecycle in LIVE mode", async ({ page }) => {
    // 1. Login as sandbox_sales
    await page.goto(`${FRONTEND_URL}/login`);
    await page.getByLabel("Username").fill("sandbox_sales");
    await page.getByLabel("Password").fill("SalesPass123!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    await expect(page).toHaveURL(`${FRONTEND_URL}/`);

    // 2. Navigate to Orders
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Orders" }).click();
    await expect(page.getByRole("button", { name: "New Order" })).toBeVisible();

    // 3. Create a new Purchase Order
    await page.getByRole("button", { name: "New Order" }).click();
    await expect(page.getByText("Create Purchase Order")).toBeVisible();

    const poNumber = `PO-LIVE-E2E-${Date.now().toString().slice(-4)}`;
    await page.getByLabel("Customer").selectOption("2");
    await page.getByLabel("PO number").fill(poNumber);
    await page.getByLabel("Description").fill("Cloud Security Compliance Consulting");
    await page.getByLabel("Quantity").fill("10");
    await page.getByLabel("Unit price").fill("5000");

    // Form -> Review
    await page.getByRole("button", { name: /Review changes/i }).click();
    await expect(page.getByRole("button", { name: "Continue to confirmation" })).toBeVisible();

    // Review -> Confirm
    await page.getByRole("button", { name: "Continue to confirmation" }).click();
    await expect(page.getByRole("button", { name: "Confirm create purchase order" })).toBeVisible();

    // Confirm -> Result
    await page.getByRole("button", { name: "Confirm create purchase order" }).click();
    await expect(page.getByRole("button", { name: "Return to workspace" })).toBeVisible();
    await page.getByRole("button", { name: "Return to workspace" }).click();

    // Verify created order exists in Orders table
    await expect(page.getByRole("button", { name: poNumber, exact: true }).first()).toBeVisible();

    // 4. Logout sales and login as sandbox_finance for conversion
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(`${FRONTEND_URL}/login`);

    await page.getByLabel("Username").fill("sandbox_finance");
    await page.getByLabel("Password").fill("FinancePass123!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    await expect(page).toHaveURL(`${FRONTEND_URL}/`);
    await mainNav.getByRole("button", { name: "Orders" }).click();

    // Open created order drawer
    await page.getByRole("button", { name: poNumber, exact: true }).first().click();
    await expect(page.getByText("ORDER DETAILS")).toBeVisible();

    // Click Convert to Invoice
    await page.getByRole("button", { name: "Convert to Invoice" }).click();
    await expect(page.getByText("Conversion to commercial invoice")).toBeVisible();

    const invNumber = `INV-E2E-${Date.now().toString().slice(-4)}`;
    await page.getByLabel("Invoice number").fill(invNumber);

    // Form -> Review
    await page.getByRole("button", { name: /Review changes/i }).click();
    await expect(page.getByRole("button", { name: "Continue to confirmation" })).toBeVisible();

    // Review -> Confirm
    await page.getByRole("button", { name: "Continue to confirmation" }).click();
    await expect(page.getByRole("button", { name: /Confirm convert/i })).toBeVisible();

    // Confirm -> Result
    await page.getByRole("button", { name: /Confirm convert/i }).click();
    await expect(page.getByRole("button", { name: "Return to workspace" })).toBeVisible();
    await page.getByRole("button", { name: "Return to workspace" }).click();

    // 5. Navigate to Invoices screen and verify converted invoice
    await mainNav.getByRole("button", { name: "Invoices" }).click();
    await expect(page.getByRole("button", { name: invNumber, exact: true }).first()).toBeVisible();

    // 6. Open the newly created invoice and cancel it
    await page.getByRole("button", { name: invNumber, exact: true }).first().click();
    await expect(page.getByText("INVOICE DETAILS")).toBeVisible();

    await page.getByRole("button", { name: "Cancel Invoice" }).click();
    await expect(page.getByText("Mandatory cancellation reason")).toBeVisible();

    await page.getByLabel("Audit reason (required)").fill("Customer project scope cancelled prior to service delivery");
    await page.getByRole("button", { name: "Review cancellation" }).click();

    await expect(page.getByRole("button", { name: "Continue to confirmation" })).toBeVisible();
    await page.getByRole("button", { name: "Continue to confirmation" }).click();

    await expect(page.getByRole("button", { name: "Confirm Cancellation" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm Cancellation" }).click();

    await expect(page.getByRole("button", { name: "Return to workspace" })).toBeVisible();
    await page.getByRole("button", { name: "Return to workspace" }).click();

    // Verify invoice status badge reflects CANCELLED
    await expect(page.getByRole("button", { name: invNumber, exact: true }).first()).toBeVisible();
    await expect(page.getByText("CANCELLED").first()).toBeVisible();
  });

  test("CF4C3-03: Browser-driven direct recurring invoice creation with live customer selection", async ({ page, request }) => {
    // 0. Setup: Authenticate as admin via backend API to prepare an isolated LIVE customer
    const loginRes = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    expect(loginRes.status()).toBe(200);
    const { token } = await loginRes.json();

    const uniqueSuffix = Date.now().toString().slice(-4);
    const customerName = `Live Direct Corp ${uniqueSuffix}`;
    const custRes = await request.post(`${BACKEND_URL}/api/customers`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        billing_name: customerName,
        billing_address: "100 Innovation Boulevard",
        city: "Bengaluru",
        state: "Karnataka",
        country: "India",
        pin_code: "560100",
        gst_number: `29AAACD${uniqueSuffix}A1Z5`,
      },
    });
    expect(custRes.status()).toBe(200);
    const createdCustomer = await custRes.json();
    const customerId = createdCustomer.id;

    try {
      // 1. Authenticate through the LIVE login screen as sandbox_finance
      await page.goto(`${FRONTEND_URL}/login`);
      await page.getByLabel("Username").fill("sandbox_finance");
      await page.getByLabel("Password").fill("FinancePass123!");
      await page.getByRole("button", { name: /Sign In/i }).click();

      await expect(page).toHaveURL(`${FRONTEND_URL}/`);

      // 2. Navigate to Orders screen
      const mainNav = page.getByRole("navigation", { name: "Main navigation" });
      await mainNav.getByRole("button", { name: "Orders" }).click();
      await expect(page.getByRole("button", { name: "New Order" })).toBeVisible();

      // 3. Open New Order modal
      await page.getByRole("button", { name: "New Order" }).click();
      await expect(page.getByText("Create Purchase Order")).toBeVisible();

      // 4. Select the newly created LIVE customer from the dropdown
      const customerSelect = page.getByLabel("Customer");
      await expect(customerSelect.getByRole("option", { name: customerName })).toBeAttached();
      await customerSelect.selectOption(String(customerId));

      // 5. Select order type: Recurring / Retainer
      await page.getByLabel("Order type").selectOption("RECURRING");

      const directInvNumber = `INV-REC-LIVE-${uniqueSuffix}`;
      await page.getByLabel(/PO number/).fill(directInvNumber);
      await page.getByLabel("Description").fill("Quarterly Cloud Architecture Retainer");
      await page.getByLabel("Quantity").fill("2");
      await page.getByLabel(/Unit price/).fill("25000");

      // 6. Form -> Review
      await page.getByRole("button", { name: /Review changes/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Invoice Value")).toBeVisible();
      await expect(dialog.getByText(/₹59,000/)).toBeVisible();

      // 7. Review -> Confirm
      await page.getByRole("button", { name: "Continue to confirmation" }).click();
      await expect(page.getByRole("button", { name: /Confirm create purchase order/i })).toBeVisible();

      // 8. Confirm -> Result
      await page.getByRole("button", { name: /Confirm create purchase order/i }).click();
      await expect(page.getByRole("button", { name: "Return to workspace" })).toBeVisible();
      await page.getByRole("button", { name: "Return to workspace" }).click();

      // 9. Navigate to Invoices screen and verify direct invoice appears
      await mainNav.getByRole("button", { name: "Invoices" }).click();
      await expect(page.getByRole("button", { name: directInvNumber, exact: true }).first()).toBeVisible();

      // 10. Click on the direct invoice and verify details
      await page.getByRole("button", { name: directInvNumber, exact: true }).first().click();
      await expect(page.getByText("INVOICE DETAILS")).toBeVisible();
      await expect(page.getByText(customerName).first()).toBeVisible();

      // 11. Verify backend persistence directly via API
      const invCheckRes = await request.get(`${BACKEND_URL}/api/invoices?search=${directInvNumber}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(invCheckRes.status()).toBe(200);
      const invCheckData = await invCheckRes.json();
      expect(invCheckData.data.length).toBeGreaterThanOrEqual(1);
      const persistedInv = invCheckData.data.find((inv: any) => inv.invoice_number === directInvNumber);
      expect(persistedInv).toBeDefined();
      expect(persistedInv.customer_id).toBe(customerId);
      expect(persistedInv.order_type).toBe("RECURRING");
      expect(persistedInv.exclusive_amount).toBe("50000.00");
      expect(persistedInv.tax_amount).toBe("9000.00");
      expect(persistedInv.total_amount).toBe("59000.00");
      expect(persistedInv.outstanding_balance).toBe("59000.00");
    } finally {
      // Cleanup: delete synthetic customer
      await request.delete(`${BACKEND_URL}/api/customers/${customerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });
});
