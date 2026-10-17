import { test, expect } from "@playwright/test";

const FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || "http://127.0.0.1:8000";

test.describe("Stage 4C.4: LIVE Payments, TDS Ledger & Non-Destructive Adjustments E2E", () => {
  test("CF4C4-E2E-01: Backend readiness check confirms payments endpoints and openapi specs", async ({ request }) => {
    const readyRes = await request.get(`${BACKEND_URL}/ready`);
    expect(readyRes.status()).toBe(200);
    const readyJson = await readyRes.json();
    expect(readyJson.status).toBe("ready");
    expect(readyJson.database).toBe("connected");

    const openapiRes = await request.get(`${BACKEND_URL}/openapi.json`);
    expect(openapiRes.status()).toBe(200);
    const openapi = await openapiRes.json();
    expect(openapi.paths["/api/payments"]).toBeDefined();
    expect(openapi.paths["/api/payments"].get).toBeDefined();
    expect(openapi.paths["/api/payments"].post).toBeDefined();
    expect(openapi.paths["/api/payments/{payment_id}/correct"]).toBeDefined();
    expect(openapi.paths["/api/payments/{payment_id}"]).toBeDefined();
    expect(openapi.paths["/api/payments/{payment_id}"].delete).toBeDefined();
  });

  test("CF4C4-E2E-02: RBAC - sandbox_viewer has read-only access to payments", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/login`);
    await page.getByLabel("Username").fill("sandbox_viewer");
    await page.getByLabel("Password").fill("ViewerPass123!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    await expect(page).toHaveURL(`${FRONTEND_URL}/`);
    const mainNav = page.getByRole("navigation", { name: "Main navigation" });
    await mainNav.getByRole("button", { name: "Invoices" }).click();

    // Invoices list: viewer should not see "Record Payment" in actions or drawer
    const firstInvoice = page.locator(".cf-table tbody tr").first();
    if (await firstInvoice.isVisible()) {
      await firstInvoice.click();
      await expect(page.getByRole("button", { name: "Record Payment" })).not.toBeVisible();
    }
  });

  test("CF4C4-E2E-03: Full Payment Settlement and Atomic Correction Workflow in LIVE mode", async ({ page, request }) => {
    // 0. Setup: Authenticate as admin via backend API to prepare an isolated LIVE customer and commercial invoice
    const loginRes = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    expect(loginRes.status()).toBe(200);
    const { token } = await loginRes.json();

    const uniqueSuffix = Date.now().toString().slice(-4);
    const customerName = `Live Payment Corp ${uniqueSuffix}`;
    const custRes = await request.post(`${BACKEND_URL}/api/customers`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        billing_name: customerName,
        billing_address: "42 Financial District",
        city: "Hyderabad",
        state: "Telangana",
        country: "India",
        pin_code: "500032",
        gst_number: `36AAACD${uniqueSuffix}B1Z8`,
      },
    });
    expect([200, 201]).toContain(custRes.status());
    const customer = await custRes.json();
    const customerId = customer.id;

    // Create a Purchase Order
    const poRes = await request.post(`${BACKEND_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fy_code: "FY 2026-27",
        customer_id: customerId,
        po_number: `PO-E2E-PAY-${uniqueSuffix}`,
        po_date: "2026-04-18",
        currency: "INR",
        items: [
          {
            description: "Enterprise ERP Cloud Migration",
            quantity: 1,
            unit_price: 100000.0,
            tax_rate: 0.18,
          },
        ],
      },
    });
    expect(poRes.status()).toBe(201);
    const po = await poRes.json();

    // Convert PO to Commercial Invoice (Total ₹1,18,000.00)
    const invNumber = `INV-E2E-PAY-${uniqueSuffix}`;
    const convRes = await request.post(`${BACKEND_URL}/api/orders/${po.id}/convert`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        invoice_number: invNumber,
        invoice_date: "2026-04-18",
        due_date: "2026-05-18",
      },
    });
    expect(convRes.status()).toBe(201);
    const invoice = await convRes.json();
    const invoiceId = invoice.id;

    try {
      // 1. Login as sandbox_admin
      await page.goto(`${FRONTEND_URL}/login`);
      await page.getByLabel("Username").fill("sandbox_admin");
      await page.getByLabel("Password").fill("AdminPass123!");
      await page.getByRole("button", { name: /Sign In/i }).click();

      await expect(page).toHaveURL(`${FRONTEND_URL}/`);

      // 2. Navigate to Invoices
      const mainNav = page.getByRole("navigation", { name: "Main navigation" });
      await mainNav.getByRole("button", { name: "Invoices" }).click();
      await expect(page.getByRole("button", { name: invNumber, exact: true }).first()).toBeVisible();

      // 3. Open Invoice Detail Drawer
      await page.getByRole("button", { name: invNumber, exact: true }).first().click();
      await expect(page.getByText("INVOICE DETAILS")).toBeVisible();
      await expect(page.getByText(customerName).first()).toBeVisible();

      // 4. Click Record Payment
      const recordPaymentBtn = page.getByRole("button", { name: "Record Payment" });
      await expect(recordPaymentBtn).toBeVisible();
      await recordPaymentBtn.click();

      // 5. Drawer Step 1: Form
      await expect(page.getByText(new RegExp(`Record Payment · ${invNumber}`, 'i'))).toBeVisible();
      const remittanceNo = `UTR-E2E-${uniqueSuffix}`;
      await page.getByLabel(/Cash payment amount/).fill("100000");
      await page.getByLabel(/TDS deduction amount/).fill("2000");
      await page.getByLabel(/TDS section/).selectOption("194C (2%)");
      await page.getByLabel(/Remittance/i).fill(remittanceNo);

      // Form -> Review
      await page.getByRole("button", { name: /Review changes/i }).click();

      // Review -> Confirm
      await expect(page.getByText(/Intended settlement details/i)).toBeVisible();
      await page.getByRole("button", { name: "Continue to confirmation" }).click();

      // Confirm -> Result
      await expect(page.getByRole("button", { name: /Confirm payment/i })).toBeVisible();
      await page.getByRole("button", { name: /Confirm payment/i }).click();

      // Result screen
      await expect(page.getByText(/Payment recorded successfully/i)).toBeVisible();
      await page.getByRole("button", { name: "Return to workspace" }).click();

      // 6. Navigate to Payments Ledger
      await mainNav.getByRole("button", { name: "Payments" }).click();
      await expect(page.getByText(remittanceNo).first()).toBeVisible();

      // 7. Verify backend payment status via API
      const payListRes = await request.get(`${BACKEND_URL}/api/payments?invoice_id=${invoiceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(payListRes.status()).toBe(200);
      const payListData = await payListRes.json();
      expect(payListData.data.length).toBe(1);
      const recordedPayment = payListData.data[0];
      expect(recordedPayment.cash_amount).toBe("100000.00");
      expect(recordedPayment.tds_amount).toBe("2000.00");
      expect(recordedPayment.total_settled).toBe("102000.00");

      // 8. Open Payment Correction Drawer in UI
      const actionBtn = page.getByRole("button", { name: `Actions for payment ${remittanceNo}` }).first();
      await actionBtn.click();
      await page.getByRole("button", { name: /Correct \/ Reverse Payment/i }).first().click();

      // 9. Execute Full Reversal
      await expect(page.getByText(/Atomic Accounting Correction/i)).toBeVisible();
      await page.getByLabel(/Correction reason/i).fill("Customer disputed invoice line item, issued full reversal");
      await page.getByRole("button", { name: /Full Reversal/i }).click();

      // Review correction
      await page.getByRole("button", { name: /Review correction/i }).click();
      await expect(page.getByText(/Financial comparison & audit trail/i)).toBeVisible();

      // Proceed to confirm
      await page.getByRole("button", { name: "Continue to confirmation" }).click();
      await expect(page.getByRole("button", { name: /Confirm correction/i })).toBeVisible();
      await page.getByRole("button", { name: /Confirm correction/i }).click();

      // Result screen
      await expect(page.getByText(/Corrected Successfully/i)).toBeVisible();
      await page.getByRole("button", { name: "Return to ledger" }).click();

      // 10. Verify backend state after reversal
      const postReversalRes = await request.get(`${BACKEND_URL}/api/payments?invoice_id=${invoiceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(postReversalRes.status()).toBe(200);
      const postReversalData = await postReversalRes.json();
      // Should have 2 transactions: original PAYMENT and REVERSAL
      expect(postReversalData.data.length).toBe(2);
      expect(postReversalData.summary.total_settled).toBe("0.00");
      expect(postReversalData.summary.total_cash).toBe("0.00");
      expect(postReversalData.summary.total_tds).toBe("0.00");

      // Verify invoice outstanding balance is restored to ₹1,18,000.00
      const invCheckRes = await request.get(`${BACKEND_URL}/api/invoices/${invoiceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(invCheckRes.status()).toBe(200);
      const invCheck = await invCheckRes.json();
      const invDetail = invCheck.invoice || invCheck;
      expect(invDetail.outstanding_balance).toBe("118000.00");
      expect(invDetail.payment_status).toBe("PENDING");

      // Verify now that net settlement is 0, invoice can be cancelled!
      const cancelRes = await request.post(`${BACKEND_URL}/api/invoices/${invoiceId}/cancel`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { reason: "Fully reversed invoice cancelled by admin" },
      });
      expect(cancelRes.status()).toBe(200);
      const cancelData = await cancelRes.json();
      expect(cancelData.lifecycle_status).toBe("CANCELLED");
    } finally {
      // Cleanup: delete synthetic customer
      await request.delete(`${BACKEND_URL}/api/customers/${customerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });
});
