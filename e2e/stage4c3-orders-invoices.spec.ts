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
});
