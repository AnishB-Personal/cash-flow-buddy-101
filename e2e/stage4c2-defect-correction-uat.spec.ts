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
});

