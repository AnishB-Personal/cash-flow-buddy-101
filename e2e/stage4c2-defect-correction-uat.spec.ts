import { test, expect } from "@playwright/test";

const STAGING_FRONTEND = "https://collectflow-stage4c2-staging.aanishb.workers.dev";
const BACKEND_TUNNEL = "https://bags-condition-energy-flexible.trycloudflare.com";

test.describe("Stage 4C.2 Independent UAT Defect Correction Verification", () => {
  test("CF4C2-B01: Backend HTTPS tunnel is healthy and responsive (no 502)", async ({ request }) => {
    const readyRes = await request.get(`${BACKEND_TUNNEL}/ready`);
    expect(readyRes.status()).toBe(200);
    const readyJson = await readyRes.json();
    expect(readyJson.status).toBe("ready");
    expect(readyJson.database).toBe("connected");

    const openapiRes = await request.get(`${BACKEND_TUNNEL}/openapi.json`);
    expect(openapiRes.status()).toBe(200);

    const meRes = await request.get(`${BACKEND_TUNNEL}/api/auth/me`);
    expect(meRes.status()).toBe(401);
  });

  test("CF4C2-02: Direct unauthenticated navigation to /customers redirects to /login", async ({ page }) => {
    await page.goto(`${STAGING_FRONTEND}/customers`);
    await expect(page).toHaveURL(`${STAGING_FRONTEND}/login`);
    await expect(page.getByRole("heading", { name: "CollectFlow" })).toBeVisible();
    await expect(page.getByText(/Mode: LIVE/i)).toBeVisible();
  });

  test("CF4C2-01: Authenticate as sandbox_admin, access live workspace and live customer master", async ({ page }) => {
    await page.goto(`${STAGING_FRONTEND}/login`);
    await expect(page.getByText(/Mode: LIVE/i)).toBeVisible();

    const loginPromise = page.waitForResponse(
      (res) => res.url().includes("/api/auth/login") && res.request().method() === "POST"
    );

    await page.getByLabel("Username").fill("sandbox_admin");
    await page.getByLabel("Password").fill("AdminPass123!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    const loginRes = await loginPromise;
    expect(loginRes.status()).toBe(200);

    await expect(page).toHaveURL(`${STAGING_FRONTEND}/`);
    await expect(page.getByText(/Live Sandbox Workspace/i)).toBeVisible();
    await expect(page.getByText(/Mock workspace/i)).not.toBeVisible();
    await expect(page.getByText(/Demo scenario/i)).not.toBeVisible();
    await expect(page.getByRole("button", { name: /Reset Demo/i })).not.toBeVisible();

    // Navigate to customers via client-side routing to preserve in-memory token
    await page.getByRole("button", { name: "Customers" }).click();
    await expect(page).toHaveURL(`${STAGING_FRONTEND}/customers`);
    await expect(page.getByRole("heading", { name: /Customer directory/i })).toBeVisible();

    // Live PostgreSQL seeded records Acme and TechVanguard
    await expect(page.getByRole("button", { name: "Acme Cloud Solutions Pvt Ltd", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "TechVanguard Infotech LLP", exact: true })).toBeVisible();

    // Verify Sign out
    const signOutBtn = page.getByRole("button", { name: /Sign out/i });
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();
    await expect(page).toHaveURL(`${STAGING_FRONTEND}/login`);
  });

  test("Customer Master Contract: Sales role customer creation & exact decimal formatting", async ({ request }) => {
    // 1. Authenticate as sandbox_sales
    const salesLoginRes = await request.post(`${BACKEND_TUNNEL}/api/auth/login`, {
      data: { username: "sandbox_sales", password: "SalesPass123!" },
    });
    expect(salesLoginRes.status()).toBe(200);
    const salesToken = (await salesLoginRes.json()).token;

    // 2. Create customer as sales role (CF4C2 Customer Permissions)
    const createRes = await request.post(`${BACKEND_TUNNEL}/api/customers`, {
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
    const listRes = await request.get(`${BACKEND_TUNNEL}/api/customers`, {
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
    const adminLoginRes = await request.post(`${BACKEND_TUNNEL}/api/auth/login`, {
      data: { username: "sandbox_admin", password: "AdminPass123!" },
    });
    const adminToken = (await adminLoginRes.json()).token;
    const delRes = await request.delete(`${BACKEND_TUNNEL}/api/customers/${newCustId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(delRes.status()).toBe(200);
  });
});
