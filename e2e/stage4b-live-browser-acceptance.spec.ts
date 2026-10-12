import { test, expect } from "@playwright/test";

// Test suite for Phase 4 Stage 4B Live Browser Acceptance against localhost FastAPI sandbox
test.describe("CollectFlow Phase 4 Stage 4B: Live Browser Authentication Acceptance", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => {
      console.error("[Browser Page Error]:", err.message);
    });
  });

  test("Check 1 & Check 15: /login renders actual live form and indicates Mode: LIVE (no mock fallback)", async ({ page }) => {
    await page.goto("/login");

    // Title & branding
    await expect(page).toHaveTitle(/CollectFlow/i);
    await expect(page.getByRole("heading", { name: "CollectFlow" })).toBeVisible();

    // In live mode, subtitle is "Sign in to your isolated sandbox session"
    await expect(page.getByText(/Sign in to your isolated sandbox session/i)).toBeVisible();

    // Verify mode indicator explicitly reflects LIVE
    await expect(page.getByText(/Mode: LIVE/i)).toBeVisible();

    // Inputs and submit button exist
    const usernameInput = page.getByLabel("Username");
    const passwordInput = page.getByLabel("Password");
    const submitBtn = page.getByRole("button", { name: /Sign In/i });

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
  });

  test("Check 2, 3, 4, 5: Sandbox Admin credentials authenticate via real POST /api/auth/login, call GET /api/auth/me, and navigate to workspace", async ({ page }) => {
    await page.goto("/login");

    const loginResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/auth/login") && res.request().method() === "POST"
    );

    await page.getByLabel("Username").fill("sandbox_admin");
    await page.getByLabel("Password").fill("AdminPass123!");

    // Click Sign In
    await page.getByRole("button", { name: /Sign In/i }).click();

    // Await response and parse json
    const loginResponse = await loginResponsePromise;
    const loginResponseStatus = loginResponse.status();
    const loginResponseBody = await loginResponse.json();

    // Wait for response and success status banner
    await expect(page.getByRole("status")).toContainText(/Authenticated as sandbox_admin/i);

    // Verify actual HTTP response received from FastAPI backend
    expect(loginResponseStatus).toBe(200);
    expect(loginResponseBody).toBeDefined();
    expect(loginResponseBody.success).toBe(true);
    expect(typeof loginResponseBody.token).toBe("string");
    expect(loginResponseBody.token.length).toBe(64); // 64 hex characters
    expect(loginResponseBody.user.username).toBe("sandbox_admin");
    expect(loginResponseBody.user.role).toBe("admin");

    // Check TanStack Router client navigation redirects to "/"
    await expect(page).toHaveURL("/", { timeout: 10000 });
  });

  test("Check 9 & Check 15: Invalid credentials display error alert, HTTP 401 received, no mock fallback", async ({ page }) => {
    await page.goto("/login");

    let loginResponseStatus = 0;
    let loginResponseBody: any = null;

    page.on("response", async (res) => {
      if (res.url().includes("/api/auth/login") && res.request().method() === "POST") {
        loginResponseStatus = res.status();
        try {
          loginResponseBody = await res.json();
        } catch {}
      }
    });

    await page.getByLabel("Username").fill("sandbox_admin");
    await page.getByLabel("Password").fill("InvalidPassword999!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    // Verify error alert
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/Invalid username or password/i);

    expect(loginResponseStatus).toBe(401);
    expect(loginResponseBody.detail).toBe("Invalid username or password");
    // Ensure we remained on /login
    await expect(page).toHaveURL("/login");
  });

  test("Check 10: Sandbox Finance, Sales, and Viewer identities authenticate with correct roles", async ({ page }) => {
    const rolesToTest = [
      { username: "sandbox_finance", pass: "FinancePass123!", role: "finance" },
      { username: "sandbox_sales", pass: "SalesPass123!", role: "sales" },
      { username: "sandbox_viewer", pass: "ViewerPass123!", role: "viewer" },
    ];

    for (const item of rolesToTest) {
      await page.goto("/login");
      await page.getByLabel("Username").fill(item.username);
      await page.getByLabel("Password").fill(item.pass);
      await page.getByRole("button", { name: /Sign In/i }).click();

      await expect(page.getByRole("status")).toContainText(
        new RegExp(`Authenticated as ${item.username}`, "i")
      );
      await expect(page.getByRole("status")).toContainText(new RegExp(item.role, "i"));
      await expect(page).toHaveURL("/", { timeout: 10000 });
    }
  });

  test("Check 7 & Check 8: Logout revokes session on backend, subsequent request with token gives 401", async ({ page }) => {
    await page.goto("/login");

    let sessionToken = "";
    page.on("response", async (res) => {
      if (res.url().includes("/api/auth/login") && res.request().method() === "POST") {
        try {
          const body = await res.json();
          sessionToken = body.token;
        } catch {}
      }
    });

    await page.getByLabel("Username").fill("sandbox_admin");
    await page.getByLabel("Password").fill("AdminPass123!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    await expect(page.getByRole("status")).toContainText(/Authenticated as sandbox_admin/i);
    expect(sessionToken.length).toBe(64);

    // Call logout via apiClient in page context while still on /login
    const logoutResult = await page.evaluate(async () => {
      const { apiClient } = await import("/src/lib/api-client.ts");
      const tokenBefore = apiClient.getToken();
      await apiClient.logout();
      const tokenAfter = apiClient.getToken();
      return { tokenBefore, tokenAfter };
    });

    expect(logoutResult.tokenBefore).toBe(sessionToken);
    expect(logoutResult.tokenAfter).toBeNull();

    // Now verify reusing revoked session token against backend returns 401
    const testReusedToken = await page.evaluate(async (token) => {
      const res = await fetch("http://127.0.0.1:8000/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: res.status, body: await res.json() };
    }, sessionToken);

    expect(testReusedToken.status).toBe(401);
    expect(testReusedToken.body.detail).toBe("Session expired or invalid token");
  });

  test("Check 11: Real 403 response preserves active session without destroying token", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Username").fill("sandbox_viewer");
    await page.getByLabel("Password").fill("ViewerPass123!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    await expect(page.getByRole("status")).toContainText(/Authenticated as sandbox_viewer/i);

    // Attempt admin-only request with viewer token
    const result = await page.evaluate(async () => {
      const { apiClient } = await import("/src/lib/api-client.ts");
      const tokenBefore = apiClient.getToken();
      let caughtError: any = null;
      try {
        await apiClient.request("/api/users", {
          method: "POST",
          body: { username: "illegal_user", password: "Password123!", role: "viewer" },
        });
      } catch (err: any) {
        caughtError = {
          name: err.name,
          status: err.status,
          message: err.message,
        };
      }
      const tokenAfter = apiClient.getToken();
      return { tokenBefore, tokenAfter, caughtError };
    });

    expect(result.caughtError).toBeDefined();
    expect(result.caughtError.status).toBe(403);
    expect(result.caughtError.message.toLowerCase()).toContain("forbidden");
    // Session token must NOT be wiped by 403
    expect(result.tokenAfter).toBe(result.tokenBefore);
    expect(result.tokenAfter).not.toBeNull();
  });

  test("Check 12: Real 401 response clears authentication state in memory", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Username").fill("sandbox_admin");
    await page.getByLabel("Password").fill("AdminPass123!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    await expect(page.getByRole("status")).toContainText(/Authenticated as sandbox_admin/i);

    // Simulate 401 by calling backend with invalid/expired token
    const result = await page.evaluate(async () => {
      const { apiClient } = await import("/src/lib/api-client.ts");
      apiClient.setToken("invalid_bogus_token_hex_00000000000000000000000000000000000000000000");
      let caughtError: any = null;
      try {
        await apiClient.request("/api/auth/me", { method: "GET" });
      } catch (err: any) {
        caughtError = {
          name: err.name,
          status: err.status,
          message: err.message,
        };
      }
      const tokenAfter = apiClient.getToken();
      return { caughtError, tokenAfter };
    });

    expect(result.caughtError).toBeDefined();
    expect(result.caughtError.status).toBe(401);
    // 401 MUST wipe token from memory
    expect(result.tokenAfter).toBeNull();
  });

  test("Check 13: Browser page refresh resets in-memory session (memory-only storage architecture)", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Username").fill("sandbox_admin");
    await page.getByLabel("Password").fill("AdminPass123!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    await expect(page.getByRole("status")).toContainText(/Authenticated as sandbox_admin/i);

    // Verify token exists before reload
    const tokenBefore = await page.evaluate(async () => {
      const { apiClient } = await import("/src/lib/api-client.ts");
      return apiClient.getToken();
    });
    expect(tokenBefore).not.toBeNull();
    expect(tokenBefore?.length).toBe(64);

    // Reload page
    await page.reload();

    // Verify token is reset to null upon reload
    const tokenAfter = await page.evaluate(async () => {
      const { apiClient } = await import("/src/lib/api-client.ts");
      return apiClient.getToken();
    });
    expect(tokenAfter).toBeNull();
  });

  test("Check 14: Zero credentials or tokens exposed in localStorage, sessionStorage, or URL parameters", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Username").fill("sandbox_admin");
    await page.getByLabel("Password").fill("AdminPass123!");
    await page.getByRole("button", { name: /Sign In/i }).click();

    await expect(page.getByRole("status")).toContainText(/Authenticated as sandbox_admin/i);

    // Verify storage
    const storageAudit = await page.evaluate(() => {
      const localKeys = Object.keys(localStorage);
      const sessionKeys = Object.keys(sessionStorage);
      const localValues = localKeys.map((k) => localStorage.getItem(k));
      const sessionValues = sessionKeys.map((k) => sessionStorage.getItem(k));

      const hasTokenInStorage = [...localValues, ...sessionValues].some((v) =>
        v?.toLowerCase().includes("token") || v?.toLowerCase().includes("adminpass")
      );

      return {
        localKeys,
        sessionKeys,
        hasTokenInStorage,
        url: window.location.href,
      };
    });

    expect(storageAudit.hasTokenInStorage).toBe(false);
    expect(storageAudit.url).not.toContain("token");
    expect(storageAudit.url).not.toContain("password");
  });

  test("Check 6: Unauthenticated access to protected actions rejects gracefully", async ({ page }) => {
    await page.goto("/login");
    const unauthCheck = await page.evaluate(async () => {
      const { apiClient } = await import("/src/lib/api-client.ts");
      let caughtError: any = null;
      try {
        await apiClient.request("/api/auth/me");
      } catch (err: any) {
        caughtError = {
          status: err.status,
          message: err.message,
        };
      }
      return { token: apiClient.getToken(), caughtError };
    });

    expect(unauthCheck.token).toBeNull();
    expect(unauthCheck.caughtError).toBeDefined();
    expect(unauthCheck.caughtError.status).toBe(401);
  });
});
