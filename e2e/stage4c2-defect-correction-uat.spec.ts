import { test, expect } from "@playwright/test";

const FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || "http://127.0.0.1:8000";

test.describe("Stage 4C.2 Independent UAT Defect Correction Verification", () => {
  test("CF4C2-B01: Backend HTTPS tunnel is healthy and responsive (no 502)", async ({ request }) => {
    const readyRes = await request.get(`${BACKEND_URL}/ready`);
    expect(readyRes.status()).toBe(200);
    const readyJson = await readyRes.json();
    expect(readyJson.status).toBe("ready");
    expect(readyJson.database).toBe("connected");

    const openapiRes = await request.get(`${BACKEND_URL}/openapi.json`);
    expect(openapiRes.status()).toBe(200);

    const meRes = await request.get(`${BACKEND_URL}/api/auth/me`);
    expect(meRes.status()).toBe(401);
  });

  test("CF4C2-02: Direct unauthenticated navigation to /customers redirects to /login", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/customers`);
    await expect(page).toHaveURL(`${FRONTEND_URL}/login`);
    await expect(page.getByRole("heading", { name: "CollectFlow" })).toBeVisible();
    await expect(page.getByText(/Mode: LIVE/i)).toBeVisible();
  });

  test("CF4C2-01: Authenticate as sandbox_admin, access live workspace and live customer master", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/login`);
    await expect(page.getByText(/Mode: LIVE/i)).toBeVisible();

    const loginPromise = page.waitForResponse(
      (res) => res.url().includes("/api/auth/login") && res.request().method() === "POST"
    );

    await page.getByLabel("Username").fill("sandbox_admin");
    await page.getByLabel("Password").fill("AdminPass123!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    const loginRes = await loginPromise;
    expect(loginRes.status()).toBe(200);

    await expect(page).toHaveURL(`${FRONTEND_URL}/`);
    await expect(page.getByText(/Live Sandbox Workspace/i)).toBeVisible();
    await expect(page.getByText(/Mock workspace/i)).not.toBeVisible();
    await expect(page.getByText(/Demo scenario/i)).not.toBeVisible();
    await expect(page.getByRole("button", { name: /Reset Demo/i })).not.toBeVisible();

    // Navigate to customers via client-side routing to preserve in-memory token
    await page.getByRole("button", { name: "Customers" }).click();
    await expect(page).toHaveURL(`${FRONTEND_URL}/customers`);
    await expect(page.getByRole("heading", { name: /Customer directory/i })).toBeVisible();

    // Live PostgreSQL seeded records Acme and TechVanguard
    await expect(page.getByRole("button", { name: "Acme Cloud Solutions Pvt Ltd", exact: true })).toBeVisible();
    await page.getByPlaceholder("Name, GSTIN or contact").fill("TechVanguard");
    await expect(page.getByRole("button", { name: "TechVanguard Infotech LLP", exact: true })).toBeVisible();

    // Verify Sign out
    const signOutBtn = page.getByRole("button", { name: /Sign out/i });
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();
    await expect(page).toHaveURL(`${FRONTEND_URL}/login`);
  });

  test("Customer Master Contract: Sales role customer creation & exact decimal formatting", async ({ request }) => {
    // 1. Authenticate as sandbox_sales
    const salesLoginRes = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_sales", password: "SalesPass123!" },
    });
    expect(salesLoginRes.status()).toBe(200);
    const salesToken = (await salesLoginRes.json()).token;

    // 2. Create customer as sales role (CF4C2 Customer Permissions)
    const createRes = await request.post(`${BACKEND_URL}/api/customers`, {
      headers: { Authorization: `Bearer ${salesToken}` },
      data: {
        billing_name: `UAT Browser Test Customer ${Date.now()}`,
        city: "Hyderabad",
        state: "Telangana",
        contact_person: "K. Rao",
      },
    });
    expect(createRes.status()).toBe(200);
    const createdData = await createRes.json();
    expect(createdData.success).toBe(true);
    const newCustId = createdData.id;

    // 3. List customers and verify exact two-decimal string formatting
    const listRes = await request.get(`${BACKEND_URL}/api/customers`, {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    expect(listRes.status()).toBe(200);
    const customers = await listRes.json();
    const acme = customers.find((c: any) => c.billing_name === "Acme Cloud Solutions Pvt Ltd");
    expect(acme).toBeDefined();
    expect(acme.total_billed).toBe("531000.00");
    expect(acme.total_paid).toBe("209000.00");
    expect(acme.total_outstanding).toBe("322000.00");

    // Clean up created customer as admin
    const adminLoginRes = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const adminToken = (await adminLoginRes.json()).token;
    const delRes = await request.delete(`${BACKEND_URL}/api/customers/${newCustId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(delRes.status()).toBe(200);
  });

  test("CF4C2-B02: Live customer-edit clears optional email and phone and confirms via fresh GET", async ({ request }) => {
    // 1. Authenticate as admin
    const adminLoginRes = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    expect(adminLoginRes.status()).toBe(200);
    const adminToken = (await adminLoginRes.json()).token;
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    // 2. Create customer with optional fields populated (email, phone_1, contact_person)
    const createRes = await request.post(`${BACKEND_URL}/api/customers`, {
      headers: adminHeaders,
      data: {
        billing_name: `Optional Fields Test Customer ${Date.now()}`,
        billing_address: "100 MG Road",
        city: "Bengaluru",
        state: "Karnataka",
        email: "initial.contact@example.com",
        phone_1: "+91 9888877777",
        contact_person: "Initial Contact",
      },
    });
    expect(createRes.status()).toBe(200);
    const customerId = (await createRes.json()).id;

    // 3. Verify created customer has populated email and phone_1
    const getRes1 = await request.get(`${BACKEND_URL}/api/customers/${customerId}`, {
      headers: adminHeaders,
    });
    expect(getRes1.status()).toBe(200);
    const cust1 = await getRes1.json();
    expect(cust1.email).toBe("initial.contact@example.com");
    expect(cust1.phone_1).toBe("+91 9888877777");

    // 4. Update customer to CLEAR optional fields (email and phone_1 explicitly cleared to null)
    const updateRes = await request.put(`${BACKEND_URL}/api/customers/${customerId}`, {
      headers: adminHeaders,
      data: {
        email: null,
        phone_1: null,
      },
    });
    expect(updateRes.status()).toBe(200);

    // 5. Fresh GET confirms cleared values in PostgreSQL
    const getRes2 = await request.get(`${BACKEND_URL}/api/customers/${customerId}`, {
      headers: adminHeaders,
    });
    expect(getRes2.status()).toBe(200);
    const cust2 = await getRes2.json();
    expect(cust2.email).toBeNull();
    expect(cust2.phone_1).toBeNull();
    expect(cust2.billing_name).toBe(cust1.billing_name);

    // 6. Clean up created customer
    const delRes = await request.delete(`${BACKEND_URL}/api/customers/${customerId}`, {
      headers: adminHeaders,
    });
    expect(delRes.status()).toBe(200);
  });

  test("CF4C2-B03: Browser-driven customer-edit workflow clears optional email and phone in UI and verifies null PUT payload & fresh GET", async ({ page, request }) => {
    // 0. Setup: Authenticate as admin via API to prepare isolated synthetic customer
    const adminLoginRes = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    expect(adminLoginRes.status()).toBe(200);
    const adminToken = (await adminLoginRes.json()).token;
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    const uniqueSuffix = Date.now();
    const customerName = `UI Edit Test Co ${uniqueSuffix}`;
    const initialEmail = `ui.edit.${uniqueSuffix}@example.com`;
    const initialPhone = "+91 9123456789";

    const createRes = await request.post(`${BACKEND_URL}/api/customers`, {
      headers: adminHeaders,
      data: {
        billing_name: customerName,
        billing_address: "99 Brigade Road",
        city: "Bengaluru",
        state: "Karnataka",
        email: initialEmail,
        phone_1: initialPhone,
        contact_person: "Initial UI Contact",
      },
    });
    expect(createRes.status()).toBe(200);
    const customerId = (await createRes.json()).id;

    try {
      // 1. Authenticate through the LIVE login screen
      await page.goto(`${FRONTEND_URL}/login`);
      await expect(page.getByText(/Mode: LIVE/i)).toBeVisible();

      const loginPromise = page.waitForResponse(
        (res) => res.url().includes("/api/auth/login") && res.request().method() === "POST"
      );
      await page.getByLabel("Username").fill("sandbox_admin");
      await page.getByLabel("Password").fill("AdminPass123!");
      await page.getByRole("button", { name: /Sign In/i }).click();

      const loginRes = await loginPromise;
      expect(loginRes.status()).toBe(200);
      await expect(page).toHaveURL(`${FRONTEND_URL}/`);
      await expect(page.getByText(/Live Sandbox Workspace/i)).toBeVisible();

      // 2. Navigate to Customers
      await page.getByRole("button", { name: "Customers" }).click();
      await expect(page).toHaveURL(`${FRONTEND_URL}/customers`);
      await expect(page.getByRole("heading", { name: /Customer directory/i })).toBeVisible();

      // 3. Search and select the isolated synthetic customer
      await page.getByPlaceholder("Name, GSTIN or contact").fill(customerName);
      await expect(page.getByRole("button", { name: customerName, exact: true })).toBeVisible();

      // 4. Open its Edit drawer
      await page.getByRole("button", { name: `Edit ${customerName}` }).click();
      await expect(page.getByRole("heading", { name: /Edit customer/i })).toBeVisible();

      // Verify initial fields populated in browser inputs
      await expect(page.getByLabel("Email")).toHaveValue(initialEmail);
      await expect(page.getByLabel("Primary phone")).toHaveValue(initialPhone);

      // 5. Clear email and phone using browser input actions
      await page.getByLabel("Email").fill("");
      await page.getByLabel("Primary phone").fill("");

      // 6. Proceed through Review and Confirm
      await page.getByRole("button", { name: /Review changes/i }).click();
      await expect(page.getByText(/Intended reference change/i)).toBeVisible();

      await page.getByRole("button", { name: /Continue to confirmation/i }).click();
      await expect(page.getByText(/Confirm edit customer in live database/i)).toBeVisible();

      // 7. Verify the resulting PUT payload contains explicit null values
      const putRequestPromise = page.waitForRequest(
        (req) => req.url().includes(`/api/customers/${customerId}`) && req.method() === "PUT"
      );

      await page.getByRole("button", { name: /Confirm reference change/i }).click();

      const putReq = await putRequestPromise;
      const putPayload = JSON.parse(putReq.postData() || "{}");
      expect(putPayload.email).toBeNull();
      expect(putPayload.phone_1).toBeNull();

      // Wait for success result modal/section
      await expect(page.getByText(/Changes successfully committed to live PostgreSQL database/i)).toBeVisible();
      await page.getByRole("button", { name: /Return to list/i }).click();

      // 8. Reload customer using a fresh backend GET
      const freshGetRes = await request.get(`${BACKEND_URL}/api/customers/${customerId}`, {
        headers: adminHeaders,
      });
      expect(freshGetRes.status()).toBe(200);
      const freshCustomer = await freshGetRes.json();

      // 9. Confirm both optional fields are null in database response
      expect(freshCustomer.email).toBeNull();
      expect(freshCustomer.phone_1).toBeNull();
      expect(freshCustomer.billing_name).toBe(customerName);
    } finally {
      // 10. Clean up the synthetic record
      await request.delete(`${BACKEND_URL}/api/customers/${customerId}`, {
        headers: adminHeaders,
      });
    }
  });

  test("CF4C2-B04: Statutory percentage reference creation converts UI percentages to unambiguous decimal rates and verifies backend readback", async ({ page, request }) => {
    // 0. Setup: Authenticate via API to prepare admin headers for readback
    const adminLoginRes = await request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    expect(adminLoginRes.status()).toBe(200);
    const adminToken = (await adminLoginRes.json()).token;
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    const suffix = Date.now().toString().slice(-6);
    const gstNameHalf = `GST Slab 0.5% ${suffix}`;
    const tdsSectionOne = `TDS-1P-${suffix}`;

    // 1. Authenticate through the LIVE login screen
    await page.goto(`${FRONTEND_URL}/login`);
    await page.getByLabel("Username").fill("sandbox_admin");
    await page.getByLabel("Password").fill("AdminPass123!");
    await page.getByRole("button", { name: /Sign In/i }).click();
    await expect(page).toHaveURL(`${FRONTEND_URL}/`);

    // 2. Navigate to Settings
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page).toHaveURL(`${FRONTEND_URL}/settings`);

    // 3. Test GST 0.5% UI Form Workflow -> Expect submitted rate 0.005
    await page.getByRole("button", { name: "GST" }).click();
    await page.getByRole("button", { name: "Add rate" }).click();
    await expect(page.getByRole("heading", { name: /Add GST rate/i })).toBeVisible();

    await page.getByLabel("Rate name").fill(gstNameHalf);
    await page.getByLabel("Rate (%)").fill("0.5");

    await page.getByRole("button", { name: /Review changes/i }).click();
    await expect(page.getByText(/Intended reference change/i)).toBeVisible();
    await page.getByRole("button", { name: /Continue to confirmation/i }).click();

    const gstPostPromise = page.waitForRequest(
      (req) => req.url().includes("/api/settings/taxes/gst") && req.method() === "POST"
    );
    await page.getByRole("button", { name: /Confirm reference change/i }).click();

    const gstReq = await gstPostPromise;
    const gstPayload = JSON.parse(gstReq.postData() || "{}");
    // Verify unambiguous decimal rate 0.005 was submitted (not 0.5 or 50)
    expect(gstPayload.rate).toBe(0.005);
    expect(gstPayload.name).toBe(gstNameHalf);

    await expect(page.getByText(/Changes successfully committed to live PostgreSQL database/i)).toBeVisible();
    await page.getByRole("button", { name: /Return to list/i }).click();

    // 4. Test TDS 1% UI Form Workflow -> Expect submitted rate 0.01
    await page.getByRole("button", { name: "TDS" }).click();
    await page.getByRole("button", { name: "Add rate" }).click();
    await expect(page.getByRole("heading", { name: /Add TDS rate/i })).toBeVisible();

    await page.getByLabel("TDS section").fill(tdsSectionOne);
    await page.getByLabel("Description").fill(`Contractor TDS 1% ${suffix}`);
    await page.getByLabel("Rate (%)").fill("1");

    await page.getByRole("button", { name: /Review changes/i }).click();
    await expect(page.getByText(/Intended reference change/i)).toBeVisible();
    await page.getByRole("button", { name: /Continue to confirmation/i }).click();

    const tdsPostPromise = page.waitForRequest(
      (req) => req.url().includes("/api/settings/taxes/tds") && req.method() === "POST"
    );
    await page.getByRole("button", { name: /Confirm reference change/i }).click();

    const tdsReq = await tdsPostPromise;
    const tdsPayload = JSON.parse(tdsReq.postData() || "{}");
    // Verify unambiguous decimal rate 0.01 was submitted (not 1 or 100)
    expect(tdsPayload.rate).toBe(0.01);
    expect(tdsPayload.section_code).toBe(tdsSectionOne);

    await expect(page.getByText(/Changes successfully committed to live PostgreSQL database/i)).toBeVisible();
    await page.getByRole("button", { name: /Return to list/i }).click();

    // 5. Backend Readback Verification for 0.5% and 1%
    const taxesGetRes = await request.get(`${BACKEND_URL}/api/settings/taxes`, {
      headers: adminHeaders,
    });
    expect(taxesGetRes.status()).toBe(200);
    const taxesData = await taxesGetRes.json();

    const createdGst = taxesData.gst_rates.find((g: any) => g.name === gstNameHalf);
    expect(createdGst).toBeDefined();
    expect(createdGst.rate).toBe(0.005);

    const createdTds = taxesData.tds_rates.find((t: any) => t.section_code === tdsSectionOne);
    expect(createdTds).toBeDefined();
    expect(createdTds.rate).toBe(0.01);

    // 6. Direct API tests for remaining acceptance cases: 1.5% -> 0.015 and 18% -> 0.18
    const gst15Res = await request.post(`${BACKEND_URL}/api/settings/taxes/gst`, {
      headers: adminHeaders,
      data: { name: `GST 1.5% ${suffix}`, rate: 0.015, tax_type: "GST" },
    });
    expect(gst15Res.status()).toBe(200);

    const gst18Res = await request.post(`${BACKEND_URL}/api/settings/taxes/gst`, {
      headers: adminHeaders,
      data: { name: `GST 18% ${suffix}`, rate: 0.18, tax_type: "GST" },
    });
    expect(gst18Res.status()).toBe(200);

    const tds15Res = await request.post(`${BACKEND_URL}/api/settings/taxes/tds`, {
      headers: adminHeaders,
      data: { section_code: `TDS-15-${suffix}`, rate: 0.015, description: "1.5% Section" },
    });
    expect(tds15Res.status()).toBe(200);

    const tds18Res = await request.post(`${BACKEND_URL}/api/settings/taxes/tds`, {
      headers: adminHeaders,
      data: { section_code: `TDS-18-${suffix}`, rate: 0.18, description: "18% Section" },
    });
    expect(tds18Res.status()).toBe(200);

    const finalReadback = await request.get(`${BACKEND_URL}/api/settings/taxes`, {
      headers: adminHeaders,
    });
    const finalData = await finalReadback.json();

    const gst15 = finalData.gst_rates.find((g: any) => g.name === `GST 1.5% ${suffix}`);
    expect(gst15.rate).toBe(0.015);

    const gst18 = finalData.gst_rates.find((g: any) => g.name === `GST 18% ${suffix}`);
    expect(gst18.rate).toBe(0.18);

    const tds15 = finalData.tds_rates.find((t: any) => t.section_code === `TDS-15-${suffix}`);
    expect(tds15.rate).toBe(0.015);

    const tds18 = finalData.tds_rates.find((t: any) => t.section_code === `TDS-18-${suffix}`);
    expect(tds18.rate).toBe(0.18);
  });
});



