import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { apiClient } from "../lib/api-client";
import { PasswordRotationModal } from "../components/collectflow/password-rotation-modal";

describe("WP-04 Frontend Auth, Sessions, CSRF & Password Rotation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    apiClient.configure({ mode: "live", baseUrl: "" });
    apiClient.clearSession();
  });

  describe("ApiClient Cookie, CSRF, and Transport Invariants", () => {
    it("attaches credentials: same-origin on all fetch requests", async () => {
      let capturedInit: RequestInit | undefined;
      vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        capturedInit = init;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, customers: [] }),
        });
      }));

      await apiClient.getCustomers();
      expect(capturedInit?.credentials).toBe("same-origin");
    });

    it("automatically attaches X-CSRF-Token on state-changing requests", async () => {
      apiClient.setCsrfToken("csrf-token-abc123xyz");

      let capturedHeaders: Record<string, string> | undefined;
      vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, id: 99, message: "Created" }),
        });
      }));

      await apiClient.createCustomer({
        billing_name: "Test Corp",
        state: "Maharashtra",
        billing_address: "123 Street",
        credit_limit: 100000,
        payment_terms_days: 30,
      });

      expect(capturedHeaders?.["X-CSRF-Token"]).toBe("csrf-token-abc123xyz");
    });

    it("retries request once after 403 CSRF error by refreshing token via /api/auth/csrf-token", async () => {
      let callCount = 0;
      apiClient.setCsrfToken("stale-csrf-token");

      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (url === "/api/auth/csrf-token") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ csrf_token: "fresh-csrf-token-777" }),
          });
        }
        if (url === "/api/customers" && callCount === 1) {
          // First attempt fails with CSRF error
          return Promise.resolve({
            ok: false,
            status: 403,
            json: async () => ({ detail: "CSRF_TOKEN_INVALID: Stale CSRF token." }),
          });
        }
        // Second attempt succeeds
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, id: 101, message: "Success" }),
        });
      }));

      const res = await apiClient.createCustomer({
        billing_name: "Retry Corp",
        state: "Karnataka",
        billing_address: "456 Avenue",
        credit_limit: 500000,
        payment_terms_days: 15,
      });

      expect(res.success).toBe(true);
      expect(apiClient.getCsrfToken()).toBe("fresh-csrf-token-777");
    });

    it("ensureAuthenticated restores session from GET /api/auth/me", async () => {
      const mockUser = {
        id: 42,
        username: "finance_lead",
        role: "finance" as const,
        full_name: "Finance Lead",
        must_change_password: false,
      };

      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        expect(url).toBe("/api/auth/me");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            authenticated: true,
            csrf_token: "csrf-restored-999",
            user: mockUser,
          }),
        });
      }));

      const user = await apiClient.ensureAuthenticated();
      expect(user).toEqual(mockUser);
      expect(apiClient.getCurrentUser()).toEqual(mockUser);
      expect(apiClient.getCsrfToken()).toBe("csrf-restored-999");
    });

    it("ensureAuthenticated clears session and returns null on 401", async () => {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ detail: "Session expired or invalid token" }),
        });
      }));

      const user = await apiClient.ensureAuthenticated();
      expect(user).toBeNull();
      expect(apiClient.getCurrentUser()).toBeNull();
    });

    it("logout calls /api/auth/logout with empty baseUrl and credentials: same-origin", async () => {
      apiClient.setCsrfToken("csrf-to-clear");
      apiClient.setToken("token-to-clear", { id: 1, username: "admin", role: "admin" });

      let logoutUrl = "";
      let logoutInit: RequestInit | undefined;
      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        logoutUrl = url;
        logoutInit = init;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, message: "Logged out successfully" }),
        });
      }));

      await apiClient.logout();
      expect(logoutUrl).toBe("/api/auth/logout");
      expect(logoutInit?.credentials).toBe("same-origin");
      expect((logoutInit?.headers as Record<string, string>)?.["X-CSRF-Token"]).toBe("csrf-to-clear");
      expect(apiClient.getToken()).toBeNull();
      expect(apiClient.getCurrentUser()).toBeNull();
      expect(apiClient.getCsrfToken()).toBeNull();
    });

    it("changePassword sends POST /api/auth/change-password and clears previous session", async () => {
      apiClient.setCsrfToken("csrf-for-rotation");
      let calledBody: any;
      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        expect(url).toBe("/api/auth/change-password");
        calledBody = JSON.parse(init?.body as string);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, message: "Password changed successfully" }),
        });
      }));

      const res = await apiClient.changePassword({
        current_password: "OldPassword123!",
        new_password: "NewStrongPassword2026!",
        confirm_password: "NewStrongPassword2026!",
      });

      expect(res.success).toBe(true);
      expect(calledBody.new_password).toBe("NewStrongPassword2026!");
      expect(apiClient.getCurrentUser()).toBeNull();
    });
  });

  describe("PasswordRotationModal UI", () => {
    it("validates password length and complexity client-side", async () => {
      const onSuccess = vi.fn();
      const onLogout = vi.fn();

      render(
        <PasswordRotationModal
          isOpen={true}
          onSuccess={onSuccess}
          onLogout={onLogout}
        />
      );

      expect(screen.getByText(/Mandatory Password Rotation/i)).toBeInTheDocument();

      const form = screen.getByRole("dialog").querySelector("form")!;
      const currentInput = screen.getByPlaceholderText(/Enter current password/i);
      const newInput = screen.getByPlaceholderText(/Enter new strong password/i);
      const confirmInput = screen.getByPlaceholderText(/Confirm new password/i);

      // 1. Empty current password
      fireEvent.change(newInput, { target: { value: "ValidPassword123!" } });
      fireEvent.change(confirmInput, { target: { value: "ValidPassword123!" } });
      fireEvent.submit(form);
      expect(screen.getByText(/Please enter your current password/i)).toBeInTheDocument();

      // 2. Short password (< 12 chars)
      fireEvent.change(currentInput, { target: { value: "OldPass123!" } });
      fireEvent.change(newInput, { target: { value: "Short1!" } });
      fireEvent.change(confirmInput, { target: { value: "Short1!" } });
      fireEvent.submit(form);
      expect(screen.getByText(/at least 12 characters long/i)).toBeInTheDocument();

      // 3. Mismatched confirmation
      fireEvent.change(newInput, { target: { value: "ValidPassword123!" } });
      fireEvent.change(confirmInput, { target: { value: "DifferentPassword123!" } });
      fireEvent.submit(form);
      expect(screen.getByText(/do not match/i)).toBeInTheDocument();

      // 4. Same as current password
      fireEvent.change(currentInput, { target: { value: "SamePassword123!" } });
      fireEvent.change(newInput, { target: { value: "SamePassword123!" } });
      fireEvent.change(confirmInput, { target: { value: "SamePassword123!" } });
      fireEvent.submit(form);
      expect(screen.getByText(/cannot be the same as your current password/i)).toBeInTheDocument();

      expect(onSuccess).not.toHaveBeenCalled();
    });

    it("successfully submits valid password change and calls onSuccess", async () => {
      const onSuccess = vi.fn();
      const onLogout = vi.fn();

      vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, message: "Password updated." }),
        });
      }));

      render(
        <PasswordRotationModal
          isOpen={true}
          onSuccess={onSuccess}
          onLogout={onLogout}
        />
      );

      fireEvent.change(screen.getByPlaceholderText(/Enter current password/i), { target: { value: "CurrentPass123!" } });
      fireEvent.change(screen.getByPlaceholderText(/Enter new strong password/i), { target: { value: "NewStrongPass2026!" } });
      fireEvent.change(screen.getByPlaceholderText(/Confirm new password/i), { target: { value: "NewStrongPass2026!" } });
      fireEvent.click(screen.getByRole("button", { name: /Update Password & Continue/i }));

      await waitFor(() => {
        expect(screen.getByText(/Password updated/i)).toBeInTheDocument();
      });
    });

    it("triggers onLogout when clicking Sign Out", () => {
      const onSuccess = vi.fn();
      const onLogout = vi.fn();

      render(
        <PasswordRotationModal
          isOpen={true}
          onSuccess={onSuccess}
          onLogout={onLogout}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /Sign Out/i }));
      expect(onLogout).toHaveBeenCalledTimes(1);
    });
  });
});
