import { describe, it, expect, beforeEach, vi } from "vitest";
import { apiClient, ApiError } from "../lib/api-client";

describe("Stage 4B Sandbox Live Integration Tests", () => {
  beforeEach(() => {
    apiClient.configure({
      mode: "live",
      baseUrl: "http://127.0.0.1:8000",
      timeoutMs: 5000,
    });
    apiClient.clearSession();
    vi.restoreAllMocks();
  });

  it("successfully authenticates against sandbox FastAPI login endpoint", async () => {
    const mockAuthResponse = {
      success: true,
      token: "a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890",
      user: {
        id: 1,
        username: "sandbox_admin",
        role: "admin" as const,
        full_name: "Sandbox Administrator",
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockAuthResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const session = await apiClient.login({
      username: "sandbox_admin",
      password: "AdminPass123!",
    });

    expect(session.token).toHaveLength(64);
    expect(session.user.username).toBe("sandbox_admin");
    expect(session.user.role).toBe("admin");
    expect(apiClient.getToken()).toBe(session.token);
    expect(apiClient.getCurrentUser()?.role).toBe("admin");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          username: "sandbox_admin",
          password: "AdminPass123!",
        }),
      })
    );
  });

  it("handles invalid credentials error without leaking sensitive fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Invalid username or password" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await apiClient.login({
        username: "sandbox_admin",
        password: "BadPassword",
      });
      expect.fail("Should have thrown 401 ApiError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(401);
      expect(err.message).toBe("Invalid username or password");
      expect(apiClient.getToken()).toBeNull();
    }
  });

  it("fetches current user profile from /api/auth/me using in-memory Bearer token", async () => {
    apiClient.setToken("valid-sandbox-token");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        authenticated: true,
        user: {
          id: 2,
          username: "sandbox_finance",
          role: "finance",
          full_name: "Sandbox Finance Specialist",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = await apiClient.fetchCurrentUser();
    expect(user.username).toBe("sandbox_finance");
    expect(user.role).toBe("finance");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/auth/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer valid-sandbox-token",
        }),
      })
    );
  });

  it("revokes token on logout and clears in-memory session", async () => {
    apiClient.setToken("active-token-to-revoke", {
      id: 1,
      username: "sandbox_admin",
      role: "admin",
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: "Logged out successfully" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.logout();

    expect(apiClient.getToken()).toBeNull();
    expect(apiClient.getCurrentUser()).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/auth/logout",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer active-token-to-revoke",
        }),
      })
    );
  });

  it("distinguishes 403 Forbidden without masquerading as 401 or clearing session", async () => {
    apiClient.setToken("viewer-sandbox-token", {
      id: 4,
      username: "sandbox_viewer",
      role: "viewer",
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ detail: "Access forbidden: Role 'viewer' is insufficient" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await apiClient.request("/api/users", { method: "POST" });
      expect.fail("Should have thrown 403 ApiError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(403);
      expect(err.message).toBe("Access forbidden: Role 'viewer' is insufficient");
      // Session must be preserved
      expect(apiClient.getToken()).toBe("viewer-sandbox-token");
    }
  });

  it("supports same-origin live mode when VITE_API_BASE_URL is empty or omitted", () => {
    // In WP-02, an empty or omitted VITE_API_BASE_URL in live mode targets same-origin without error or fallback to mock
    const originalUrl = import.meta.env["VITE_API_BASE_URL"];
    const originalMode = import.meta.env["VITE_API_MODE"];
    try {
      delete (import.meta.env as any)["VITE_API_BASE_URL"];
      (import.meta.env as any)["VITE_API_MODE"] = "live";

      apiClient.initFromEnv();
      expect(apiClient.getMode()).toBe("live");
      expect(apiClient.getBaseUrl()).toBe("");

      // Explicit empty string
      (import.meta.env as any)["VITE_API_BASE_URL"] = "";
      apiClient.initFromEnv();
      expect(apiClient.getMode()).toBe("live");
      expect(apiClient.getBaseUrl()).toBe("");
    } finally {
      (import.meta.env as any)["VITE_API_BASE_URL"] = originalUrl;
      (import.meta.env as any)["VITE_API_MODE"] = originalMode || "mock";
      apiClient.initFromEnv();
    }
  });
});
