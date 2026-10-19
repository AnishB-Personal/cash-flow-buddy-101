import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { apiClient } from "../lib/api-client";
import { PasswordRotationModal } from "../components/collectflow/password-rotation-modal";
import { Workspace } from "../components/collectflow/workspace";
import { MockSessionProvider } from "../components/collectflow/session";

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  };
});

describe("WP-04 Frontend Auth, Sessions, CSRF & Password Rotation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
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

    it("logout returns LogoutResult on 200 success", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, message: "Logged out successfully" }),
      }));

      const res = await apiClient.logout();
      expect(res.success).toBe(true);
      expect(res.serverRevoked).toBe(true);
      expect(res.status).toBe(200);
      expect(res.message).toContain("Logged out successfully");
    });

    it("logout returns LogoutResult on 401 already expired session", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Session expired or invalid" }),
      }));

      const res = await apiClient.logout();
      expect(res.success).toBe(true);
      expect(res.serverRevoked).toBe(true);
      expect(res.status).toBe(401);
      expect(res.message).toContain("already expired or invalid");
    });

    it("logout returns failure on 403 server rejection", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ detail: "CSRF token invalid" }),
      }));

      const res = await apiClient.logout();
      expect(res.success).toBe(false);
      expect(res.serverRevoked).toBe(false);
      expect(res.status).toBe(403);
      expect(res.error).toBe("Server rejected revocation");
    });

    it("logout returns failure on 500 server error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: "Internal server error" }),
      }));

      const res = await apiClient.logout();
      expect(res.success).toBe(false);
      expect(res.serverRevoked).toBe(false);
      expect(res.status).toBe(500);
      expect(res.error).toContain("Server error 500");
    });

    it("logout handles network failure gracefully and wipes local session", async () => {
      apiClient.setToken("some-token", { id: 1, username: "admin", role: "admin" });
      apiClient.setCsrfToken("some-csrf");

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network connection lost")));

      const res = await apiClient.logout();
      expect(res.success).toBe(false);
      expect(res.serverRevoked).toBe(false);
      expect(res.error).toBe("Network connection lost");
      expect(apiClient.getToken()).toBeNull();
      expect(apiClient.getCurrentUser()).toBeNull();
      expect(apiClient.getCsrfToken()).toBeNull();
    });

    it("downloadExport includes credentials: same-origin in fetch options", async () => {
      let capturedInit: RequestInit | undefined;
      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        capturedInit = init;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ "Content-Disposition": 'attachment; filename="test_export.xlsx"' }),
          blob: async () => new Blob(["test-data"]),
        });
      }));

      await apiClient.downloadExport("excel", { ticket: "valid-ticket-123", fy: "ALL", scope: "all" });
      expect(capturedInit?.credentials).toBe("same-origin");
      expect(capturedInit?.method).toBe("GET");
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

  describe("Stale Session State Restoration Prevention (WP04-R02)", () => {
    it("in-flight /me request does NOT restore user or CSRF token if logout occurs before response", async () => {
      let resolveMe: (value: any) => void = () => {};
      const mePromise = new Promise((resolve) => {
        resolveMe = resolve;
      });

      apiClient.configure({ mode: "live", baseUrl: "" });
      apiClient.setToken("session-token-1", { id: 1, username: "alice", role: "admin" });
      apiClient.setCsrfToken("initial-csrf");

      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        if (url === "/api/auth/me") {
          return mePromise;
        }
        if (url === "/api/auth/logout") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true, message: "Logged out" }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      }));

      // Start in-flight /me request
      const fetchPromise = apiClient.fetchCurrentUser();

      // Logout occurs while /me is still in-flight
      const logoutResult = await apiClient.logout();
      expect(logoutResult.serverRevoked).toBe(true);
      expect(apiClient.getCurrentUser()).toBeNull();
      expect(apiClient.getCsrfToken()).toBeNull();

      // Resolve the late /me response
      resolveMe({
        ok: true,
        status: 200,
        json: async () => ({
          authenticated: true,
          csrf_token: "late-stale-csrf-token",
          user: { id: 1, username: "alice", role: "admin" },
        }),
      });

      // Verify that fetchCurrentUser rejected and state was NOT restored
      await expect(fetchPromise).rejects.toThrow("Session invalidated during user verification");
      expect(apiClient.getCurrentUser()).toBeNull();
      expect(apiClient.getCsrfToken()).toBeNull();
    });

    it("in-flight CSRF refresh does NOT restore CSRF token if logout occurs before response", async () => {
      let resolveCsrf: (value: any) => void = () => {};
      const csrfPromise = new Promise((resolve) => {
        resolveCsrf = resolve;
      });

      apiClient.configure({ mode: "live", baseUrl: "" });
      apiClient.setCsrfToken("active-csrf");

      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        if (url === "/api/auth/csrf-token") {
          return csrfPromise;
        }
        if (url === "/api/auth/logout") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true, message: "Logged out" }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      }));

      // Start in-flight fetchCsrfToken
      const csrfFetchPromise = apiClient.fetchCsrfToken();

      // Logout occurs while csrf refresh is in-flight
      await apiClient.logout();
      expect(apiClient.getCsrfToken()).toBeNull();

      // Resolve late CSRF response
      resolveCsrf({
        ok: true,
        status: 200,
        json: async () => ({
          csrf_token: "resurrected-csrf-token",
        }),
      });

      await expect(csrfFetchPromise).rejects.toThrow("Session invalidated during CSRF token refresh");
      expect(apiClient.getCsrfToken()).toBeNull();
    });

    it("late /me from an older session does NOT overwrite a newly authenticated user", async () => {
      let resolveFirstMe: (value: any) => void = () => {};
      const firstMePromise = new Promise((resolve) => {
        resolveFirstMe = resolve;
      });

      apiClient.configure({ mode: "live", baseUrl: "" });
      apiClient.setToken("session-alice", { id: 1, username: "alice", role: "admin" });

      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        if (url === "/api/auth/me") {
          return firstMePromise;
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      }));

      // Start /me for Alice
      const alicePromise = apiClient.fetchCurrentUser();

      // Switch session to Bob
      apiClient.setToken("session-bob", { id: 2, username: "bob", role: "sales" });
      apiClient.setCsrfToken("bob-csrf");

      // Late response resolves for Alice
      resolveFirstMe({
        ok: true,
        status: 200,
        json: async () => ({
          authenticated: true,
          csrf_token: "alice-csrf",
          user: { id: 1, username: "alice", role: "admin" },
        }),
      });

      await expect(alicePromise).rejects.toThrow("Session invalidated during user verification");
      expect(apiClient.getCurrentUser()?.username).toBe("bob");
      expect(apiClient.getCsrfToken()).toBe("bob-csrf");
    });
  });

  describe("Workspace UI Logout Integration (WP04-R01)", () => {
    function setupWorkspaceMockFetch(logoutStatusOrHandler: number | ((init?: RequestInit) => any), mustChangePassword = false) {
      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url === "/api/auth/me") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              authenticated: true,
              csrf_token: "live-csrf-token",
              user: {
                id: 1,
                username: "admin_user",
                role: "admin",
                full_name: "Admin User",
                must_change_password: mustChangePassword,
              },
            }),
          });
        }
        if (url.startsWith("/api/orders")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: [] }),
          });
        }
        if (url.startsWith("/api/invoices")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: [] }),
          });
        }
        if (url === "/api/auth/logout") {
          if (typeof logoutStatusOrHandler === "function") {
            return logoutStatusOrHandler(init);
          }
          if (logoutStatusOrHandler === 200) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ success: true, message: "Logged out successfully" }),
            });
          }
          if (logoutStatusOrHandler === 403) {
            return Promise.resolve({
              ok: false,
              status: 403,
              json: async () => ({ detail: "CSRF token mismatch" }),
            });
          }
          if (logoutStatusOrHandler === 500) {
            return Promise.resolve({
              ok: false,
              status: 500,
              json: async () => ({ detail: "Internal server error" }),
            });
          }
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      }));
    }

    it("confirmed logout (200 OK) navigates to /login without warning screen", async () => {
      setupWorkspaceMockFetch(200);

      render(
        <MockSessionProvider>
          <Workspace initial="Dashboard" />
        </MockSessionProvider>
      );

      const signOutBtn = await screen.findByRole("button", { name: "Sign out" });
      fireEvent.click(signOutBtn);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
      });
      expect(screen.queryByRole("alert", { name: "Logout Warning" })).not.toBeInTheDocument();
    });

    it("logout server rejection (HTTP 403) displays warning alert, clears local session, and enables manual navigation", async () => {
      setupWorkspaceMockFetch(403);

      render(
        <MockSessionProvider>
          <Workspace initial="Dashboard" />
        </MockSessionProvider>
      );

      const signOutBtn = await screen.findByRole("button", { name: "Sign out" });
      fireEvent.click(signOutBtn);

      const alert = await screen.findByRole("alert", { name: "Logout Warning" });
      expect(alert).toBeInTheDocument();
      expect(screen.getByText("Server Logout Incomplete")).toBeInTheDocument();
      expect(screen.getByTestId("logout-warning-message")).toHaveTextContent("403 Forbidden");
      expect(mockNavigate).not.toHaveBeenCalledWith({ to: "/login" });
      expect(apiClient.getCurrentUser()).toBeNull();

      // Proceed to login recovery action
      const proceedBtn = screen.getByRole("button", { name: "Proceed to Login" });
      fireEvent.click(proceedBtn);
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
    });

    it("logout server error (HTTP 500) displays warning alert with status code", async () => {
      setupWorkspaceMockFetch(500);

      render(
        <MockSessionProvider>
          <Workspace initial="Dashboard" />
        </MockSessionProvider>
      );

      const signOutBtn = await screen.findByRole("button", { name: "Sign out" });
      fireEvent.click(signOutBtn);

      const alert = await screen.findByRole("alert", { name: "Logout Warning" });
      expect(alert).toBeInTheDocument();
      expect(screen.getByTestId("logout-warning-message")).toHaveTextContent("500");
      expect(mockNavigate).not.toHaveBeenCalledWith({ to: "/login" });
    });

    it("logout network failure displays warning alert and allows Retry Logout recovery", async () => {
      let failNetwork = true;
      setupWorkspaceMockFetch(() => {
        if (failNetwork) {
          return Promise.reject(new Error("Connection reset by peer"));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, message: "Logged out on retry" }),
        });
      });

      render(
        <MockSessionProvider>
          <Workspace initial="Dashboard" />
        </MockSessionProvider>
      );

      const signOutBtn = await screen.findByRole("button", { name: "Sign out" });
      fireEvent.click(signOutBtn);

      const alert = await screen.findByRole("alert", { name: "Logout Warning" });
      expect(alert).toBeInTheDocument();
      expect(screen.getByTestId("logout-warning-message")).toHaveTextContent(/Network failure/i);

      // Network recovers, click Retry Logout
      failNetwork = false;
      const retryBtn = screen.getByRole("button", { name: "Retry Logout" });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
      });
    });

    it("logout from PasswordRotationModal handles server revocation failure gracefully", async () => {
      setupWorkspaceMockFetch(500, true);

      render(
        <MockSessionProvider>
          <Workspace initial="Dashboard" />
        </MockSessionProvider>
      );

      const modalTitle = await screen.findByText(/Mandatory Password Rotation/i);
      expect(modalTitle).toBeInTheDocument();

      const dialog = screen.getByRole("dialog");
      const modalSignOutBtn = within(dialog).getByRole("button", { name: /Sign Out/i });
      fireEvent.click(modalSignOutBtn);

      const alert = await screen.findByRole("alert", { name: "Logout Warning" });
      expect(alert).toBeInTheDocument();
      expect(screen.queryByText(/Mandatory Password Rotation/i)).not.toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalledWith({ to: "/login" });
    });
  });
});
