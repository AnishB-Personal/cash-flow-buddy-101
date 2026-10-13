import { describe, it, expect, beforeEach, vi } from "vitest";
import { apiClient, ApiError } from "../lib/api-client";

describe("ApiClient Core & Authentication (Stage 4B)", () => {
  beforeEach(() => {
    apiClient.configure({ mode: "mock", baseUrl: "http://127.0.0.1:8000" });
    apiClient.clearSession();
    vi.restoreAllMocks();
  });

  it("defaults to mock mode without throwing configuration errors", () => {
    expect(apiClient.getMode()).toBe("mock");
    expect(apiClient.getToken()).toBeNull();
    expect(apiClient.getCurrentUser()).toBeNull();
  });

  it("stores token strictly in-memory without touching window storage", () => {
    apiClient.setToken("test-token-12345", {
      id: 1,
      username: "admin_test",
      role: "admin",
      full_name: "Admin Tester",
    });

    expect(apiClient.getToken()).toBe("test-token-12345");
    expect(apiClient.getCurrentUser()?.username).toBe("admin_test");

    // Clear session resets in-memory values
    apiClient.clearSession();
    expect(apiClient.getToken()).toBeNull();
    expect(apiClient.getCurrentUser()).toBeNull();
  });

  it("formats live HTTP requests with Bearer headers and Idempotency-Key", async () => {
    apiClient.configure({ mode: "live", baseUrl: "http://127.0.0.1:8000" });
    apiClient.setToken("sample-auth-token");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "healthy" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiClient.request<{ status: string }>("/health", {
      method: "GET",
      idempotencyKey: "idem-key-123",
    });

    expect(result.status).toBe("healthy");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/health",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer sample-auth-token",
          "Idempotency-Key": "idem-key-123",
        }),
      })
    );
  });

  it("handles 401 Unauthorized by clearing in-memory token and triggering callback", async () => {
    apiClient.configure({ mode: "live", baseUrl: "http://127.0.0.1:8000" });
    apiClient.setToken("expired-token");

    let sessionClearedCallbackCalled = false;
    apiClient.onUnauthorized(() => {
      sessionClearedCallbackCalled = true;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Token expired" }),
      })
    );

    await expect(apiClient.request("/api/auth/me")).rejects.toThrow(ApiError);
    expect(apiClient.getToken()).toBeNull();
    expect(sessionClearedCallbackCalled).toBe(true);
  });

  it("handles 403 Forbidden without masquerading as 401", async () => {
    apiClient.configure({ mode: "live", baseUrl: "http://127.0.0.1:8000" });
    apiClient.setToken("viewer-token");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ detail: "Access forbidden" }),
      })
    );

    try {
      await apiClient.request("/api/users", { method: "POST" });
      expect.fail("Should have thrown ApiError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(403);
      // In-memory token must NOT be cleared on 403
      expect(apiClient.getToken()).toBe("viewer-token");
    }
  });

  it("handles network failure gracefully with structured ApiError", async () => {
    apiClient.configure({ mode: "live", baseUrl: "http://127.0.0.1:8000" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Failed to fetch"))
    );

    try {
      await apiClient.request("/api/meta");
      expect.fail("Should have thrown network ApiError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(0);
      expect(err.isNetworkError).toBe(true);
      expect(err.message).toContain("Network failure: Unable to reach backend");
    }
  });

  it("delayed 401 does not clear a newer session", async () => {
    apiClient.configure({ mode: "live", baseUrl: "http://127.0.0.1:8000" });
    apiClient.setToken("token-user-1", { id: 1, username: "user1", role: "sales", full_name: "User One" });

    let unauthCallbackCalled = false;
    apiClient.onUnauthorized(() => {
      unauthCallbackCalled = true;
    });

    let resolveDelayed401: (val: any) => void;
    const delayed401Promise = new Promise((resolve) => {
      resolveDelayed401 = resolve;
    });

    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => delayed401Promise));

    // Request 1 starts with token-user-1
    const req1Promise = apiClient.request("/api/customers");

    // Before req1 finishes, User 2 logs in
    apiClient.setToken("token-user-2", { id: 2, username: "user2", role: "admin", full_name: "User Two" });

    // Now req1 finishes with 401
    resolveDelayed401!({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Token 1 expired" }),
    });

    await expect(req1Promise).rejects.toThrow(ApiError);

    // Stale 401 must NOT clear the new session
    expect(apiClient.getToken()).toBe("token-user-2");
    expect(apiClient.getCurrentUser()?.username).toBe("user2");
    expect(unauthCallbackCalled).toBe(false);
  });

  it("delayed /auth/me does not overwrite another user's identity upon account switching", async () => {
    apiClient.configure({ mode: "live", baseUrl: "http://127.0.0.1:8000" });
    const userAisha = { id: 1, username: "aisha", role: "finance" as const, full_name: "Aisha Khan" };
    const userBob = { id: 2, username: "bob", role: "admin" as const, full_name: "Bob Admin" };

    apiClient.setToken("token-aisha", userAisha);

    let resolveMe: (val: any) => void;
    const delayedMePromise = new Promise((resolve) => {
      resolveMe = resolve;
    });

    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => delayedMePromise));

    // Aisha initiates fetchCurrentUser
    const aishaFetchPromise = apiClient.fetchCurrentUser();

    // User switches to Bob before Aisha's response returns
    apiClient.setToken("token-bob", userBob);

    // Now Aisha's /auth/me resolves
    resolveMe!({
      ok: true,
      status: 200,
      json: async () => ({ authenticated: true, user: userAisha }),
    });

    await aishaFetchPromise.catch(() => {});

    // Must NOT have overwritten Bob's identity with Aisha
    expect(apiClient.getCurrentUser()?.username).toBe("bob");
    expect(apiClient.getToken()).toBe("token-bob");
  });

  it("logout immediately invalidates local authentication without allowing late responses to restore it", async () => {
    apiClient.configure({ mode: "live", baseUrl: "http://127.0.0.1:8000" });
    const userAisha = { id: 1, username: "aisha", role: "finance" as const, full_name: "Aisha Khan" };
    apiClient.setToken("token-aisha", userAisha);

    let resolveLateFetch: (val: any) => void;
    const delayedFetchPromise = new Promise((resolve) => {
      resolveLateFetch = resolve;
    });

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/auth/logout")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        });
      }
      return delayedFetchPromise;
    }));

    // In-flight fetchCurrentUser
    const mePromise = apiClient.fetchCurrentUser();

    // User calls logout
    const logoutPromise = apiClient.logout();

    // Logout must immediately invalidate local auth synchronously
    expect(apiClient.getToken()).toBeNull();
    expect(apiClient.getCurrentUser()).toBeNull();

    await logoutPromise;

    // Now late /me response arrives
    resolveLateFetch!({
      ok: true,
      status: 200,
      json: async () => ({ authenticated: true, user: userAisha }),
    });

    await mePromise.catch(() => {});

    // Must remain logged out and null
    expect(apiClient.getToken()).toBeNull();
    expect(apiClient.getCurrentUser()).toBeNull();
  });

  it("logout and login overlap preserves the newly established session", async () => {
    apiClient.configure({ mode: "live", baseUrl: "http://127.0.0.1:8000" });
    const user1 = { id: 1, username: "user1", role: "sales" as const, full_name: "User 1" };
    const user2 = { id: 2, username: "user2", role: "admin" as const, full_name: "User 2" };

    apiClient.setToken("token-1", user1);

    let resolveLogout: (val: any) => void;
    const delayedLogoutPromise = new Promise((resolve) => {
      resolveLogout = resolve;
    });

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/auth/logout")) {
        return delayedLogoutPromise;
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });
    }));

    // Start logout of user 1
    const logoutPromise = apiClient.logout();

    // While logout backend call is pending, User 2 logs in
    apiClient.setToken("token-2", user2);

    // Backend logout now resolves
    resolveLogout!({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: "Logged out" }),
    });

    await logoutPromise;

    // The late completion of logout must NOT wipe User 2's session
    expect(apiClient.getToken()).toBe("token-2");
    expect(apiClient.getCurrentUser()?.username).toBe("user2");
  });

  it("two overlapping login requests returning in reverse order preserves the most recent intended login", async () => {
    apiClient.configure({ mode: "live", baseUrl: "http://127.0.0.1:8000" });
    const userA = { id: 1, username: "userA", role: "sales" as const, full_name: "User A" };
    const userB = { id: 2, username: "userB", role: "admin" as const, full_name: "User B" };

    let resolveLoginA: (val: any) => void;
    const delayedLoginAPromise = new Promise((resolve) => {
      resolveLoginA = resolve;
    });

    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, options: any) => {
      const body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
      if (body.username === "userA") {
        return delayedLoginAPromise;
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          token: "token-userB",
          user: userB,
        }),
      });
    }));

    // User A login initiated first
    const loginAPromise = apiClient.login({ username: "userA", password: "PasswordA!" });

    // User B login initiated second (most recent intended login)
    const loginBPromise = apiClient.login({ username: "userB", password: "PasswordB!" });

    // Login B completes first
    await loginBPromise;
    expect(apiClient.getToken()).toBe("token-userB");
    expect(apiClient.getCurrentUser()?.username).toBe("userB");

    // Login A completes second (delayed reverse order) and must reject as superseded
    resolveLoginA!({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        token: "token-userA",
        user: userA,
      }),
    });
    await expect(loginAPromise).rejects.toThrow(ApiError);
    await expect(loginAPromise).rejects.toMatchObject({
      status: 409,
      isSuperseded: true,
    });

    // The most recent intended login (User B) must control the final session
    expect(apiClient.getToken()).toBe("token-userB");
    expect(apiClient.getCurrentUser()?.username).toBe("userB");
  });

  it("logout invalidates pending in-flight login attempts", async () => {
    apiClient.configure({ mode: "live", baseUrl: "http://127.0.0.1:8000" });
    const userA = { id: 1, username: "userA", role: "sales" as const, full_name: "User A" };

    let resolveLogin: (val: any) => void;
    const delayedLoginPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/auth/logout")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
      }
      return delayedLoginPromise;
    }));

    const loginPromise = apiClient.login({ username: "userA", password: "PasswordA!" });

    // User logs out while login is in-flight
    await apiClient.logout();

    // Now late login response arrives
    resolveLogin!({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        token: "token-userA",
        user: userA,
      }),
    });

    await expect(loginPromise).rejects.toThrow(ApiError);
    await expect(loginPromise).rejects.toMatchObject({
      status: 409,
      isSuperseded: true,
    });
    expect(apiClient.getToken()).toBeNull();
    expect(apiClient.getCurrentUser()).toBeNull();
  });
});



