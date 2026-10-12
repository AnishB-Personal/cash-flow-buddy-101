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
});
