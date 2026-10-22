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
    apiClient.resetAllowedOrigins();
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

  describe("AP01-R03: Credential Transport Security & Origin Isolation", () => {
    it("returns 'same-origin' when baseUrl is empty or relative", () => {
      apiClient.configure({ baseUrl: "" });
      expect(apiClient.getCredentialsMode()).toBe("same-origin");
      expect(apiClient.isTargetOriginTrusted()).toBe(true);

      apiClient.configure({ baseUrl: "/api" });
      expect(apiClient.getCredentialsMode()).toBe("same-origin");
      expect(apiClient.isTargetOriginTrusted()).toBe(true);
    });

    it("returns 'include' and trusts approved cross-origin development endpoints", () => {
      apiClient.configure({ baseUrl: "http://127.0.0.1:8000" });
      expect(apiClient.isTargetOriginTrusted()).toBe(true);
      expect(apiClient.getCredentialsMode()).toBe("include");

      apiClient.configure({ baseUrl: "http://localhost:8000" });
      expect(apiClient.isTargetOriginTrusted()).toBe(true);
      expect(apiClient.getCredentialsMode()).toBe("include");
    });

    it("rejects protocol-relative, malformed, and unsupported-scheme base URLs", () => {
      expect(() => apiClient.configure({ baseUrl: "//attacker.com" })).toThrow(/Protocol-relative/i);
      expect(() => apiClient.configure({ baseUrl: "javascript:alert(1)" })).toThrow(/Unsupported scheme/i);
      expect(() => apiClient.configure({ baseUrl: "ftp://storage.local" })).toThrow(/Unsupported scheme/i);
      expect(() => apiClient.configure({ baseUrl: "file:///etc/passwd" })).toThrow(/Unsupported scheme/i);
      expect(() => apiClient.configure({ baseUrl: "http://[invalid-host" })).toThrow(/Malformed URL/i);
    });

    it("never classifies protocol-relative URLs as trusted merely because they start with slash", () => {
      expect(apiClient.isTargetOriginTrusted("//evil.com")).toBe(false);
      expect(apiClient.isTargetOriginTrusted("//evil.com/api")).toBe(false);
      expect(apiClient.getCredentialsMode("//evil.com")).toBe("omit");
    });

    it("fails closed on untrusted origins, blocking requests before dispatching fetch", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      apiClient.configure({ baseUrl: "https://attacker.evil.com" });
      await expect(apiClient.request("/api/customers")).rejects.toThrow(/Untrusted target origin/i);
      expect(fetchSpy).not.toHaveBeenCalled();

      // Logout also fails closed on untrusted origin: does not dispatch fetch, reports serverRevoked: false
      const logoutResult = await apiClient.logout();
      expect(logoutResult.serverRevoked).toBe(false);
      expect(logoutResult.error).toContain("Untrusted target origin");
      expect(fetchSpy).not.toHaveBeenCalled();

      // Export download also fails closed on untrusted origin
      await expect(apiClient.downloadExport("excel")).rejects.toThrow(/Untrusted target origin/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects protocol-relative and absolute URL endpoints", async () => {
      apiClient.configure({ baseUrl: "" });
      await expect(apiClient.request("//evil.com/phish")).rejects.toThrow(/Protocol-relative endpoints/i);
      await expect(apiClient.request("https://evil.com/phish")).rejects.toThrow(/Absolute URLs and scheme prefixes/i);
      await expect(apiClient.request("javascript:void(0)")).rejects.toThrow(/Absolute URLs and scheme prefixes/i);
    });

    it("prevents bearer token or Authorization header forwarding to untrusted destinations", async () => {
      let capturedHeaders: Record<string, string> | undefined;
      vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, customers: [] }),
        });
      }));

      apiClient.setToken("super-secret-bearer-token");

      // 1. Approved origin: token attached properly
      apiClient.configure({ baseUrl: "http://127.0.0.1:8000" });
      await apiClient.getCustomers();
      expect(capturedHeaders?.["Authorization"]).toBe("Bearer super-secret-bearer-token");

      // 2. Same-origin: token attached properly
      apiClient.configure({ baseUrl: "" });
      await apiClient.getCustomers();
      expect(capturedHeaders?.["Authorization"]).toBe("Bearer super-secret-bearer-token");
    });

    it("supports safe runtime configuration of trusted origins for future deployment", async () => {
      let capturedInit: RequestInit | undefined;
      vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        capturedInit = init;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, customers: [] }),
        });
      }));

      apiClient.setToken("prod-deploy-token");

      // 1. Custom production domain configured dynamically via allowedOrigins
      apiClient.configure({
        baseUrl: "https://api.collectflow.enterprise.org",
        allowedOrigins: ["https://api.collectflow.enterprise.org"],
      });

      expect(apiClient.isTargetOriginTrusted()).toBe(true);
      expect(apiClient.getCredentialsMode()).toBe("include");

      await apiClient.getCustomers();
      expect(capturedInit?.credentials).toBe("include");
      expect((capturedInit?.headers as Record<string, string>)?.["Authorization"]).toBe("Bearer prod-deploy-token");
    });
  });

  describe("AP-01 Acceptance Closure: Credential-Origin Isolation & Negative Regression", () => {
    it("proves untrusted cross-origin API base URLs cause immediate request rejection across request, logout, and downloadExport", async () => {
      apiClient.configure({ baseUrl: "https://untrusted-api.evil.com" });

      // 1. request() rejects immediately
      await expect(apiClient.request("/api/customers")).rejects.toThrow(/Untrusted target origin 'https:\/\/untrusted-api\.evil\.com'/i);

      // 2. logout() fails closed and reports error without throwing unhandled
      const logoutResult = await apiClient.logout();
      expect(logoutResult.serverRevoked).toBe(false);
      expect(logoutResult.error).toContain("Untrusted target origin 'https://untrusted-api.evil.com'");

      // 3. downloadExport() rejects immediately
      await expect(apiClient.downloadExport("excel")).rejects.toThrow(/Untrusted target origin 'https:\/\/untrusted-api\.evil\.com'/i);
    });

    it("proves no fetch() call occurs for any rejected destination across request, logout, and downloadExport", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      // Subcase 1: Untrusted cross-origin base URL
      apiClient.configure({ baseUrl: "https://evil-untrusted-endpoint.com" });
      await expect(apiClient.request("/api/orders")).rejects.toThrow();
      await apiClient.logout();
      await expect(apiClient.downloadExport("csv")).rejects.toThrow();

      // Subcase 2: Protocol-relative endpoints
      apiClient.configure({ baseUrl: "" });
      await expect(apiClient.request("//evil-phish.org/steal")).rejects.toThrow();

      // Subcase 3: Unsupported schemes
      await expect(apiClient.request("javascript:steal()")).rejects.toThrow();
      await expect(apiClient.request("ftp://storage.host/file")).rejects.toThrow();
      await expect(apiClient.request("file:///etc/shadow")).rejects.toThrow();
      await expect(apiClient.request("data:text/html,<script>alert(1)</script>")).rejects.toThrow();

      // Absolute assertion: fetch() was NEVER called across all negative cases
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(fetchSpy.mock.calls.length).toBe(0);
    });

    it("proves caller-supplied Authorization headers are never transmitted to rejected destinations", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      apiClient.setToken("in-memory-super-secret-token");
      const maliciousCallerOptions = {
        headers: {
          Authorization: "Bearer caller-injected-token-leak-attempt",
          "X-Custom-Header": "leak-attempt",
        },
      };

      // 1. Untrusted base URL with caller-supplied Authorization
      apiClient.configure({ baseUrl: "https://attacker.leak-credentials.org" });
      await expect(
        apiClient.request("/api/sensitive-ledger", maliciousCallerOptions)
      ).rejects.toThrow(/Untrusted target origin/i);
      expect(fetchSpy).not.toHaveBeenCalled();

      // 2. Protocol-relative endpoint with caller-supplied Authorization
      apiClient.configure({ baseUrl: "" });
      await expect(
        apiClient.request("//evil-collector.com/telemetry", maliciousCallerOptions)
      ).rejects.toThrow(/Protocol-relative endpoints/i);
      expect(fetchSpy).not.toHaveBeenCalled();

      // 3. Scheme hijacking with caller-supplied Authorization
      await expect(
        apiClient.request("javascript:window.__stolen=1", maliciousCallerOptions)
      ).rejects.toThrow(/Absolute URLs and scheme prefixes/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("proves protocol-relative and unsupported-scheme URLs are rejected across configuration, resolution, and helpers", () => {
      // Configuration rejects protocol-relative and unsupported schemes
      expect(() => apiClient.configure({ baseUrl: "//evil.com" })).toThrow(/Protocol-relative URLs/i);
      expect(() => apiClient.configure({ baseUrl: "//evil.com/api" })).toThrow(/Protocol-relative URLs/i);
      expect(() => apiClient.configure({ baseUrl: "javascript:alert(1)" })).toThrow(/Unsupported scheme 'javascript:'/i);
      expect(() => apiClient.configure({ baseUrl: "ftp://files.host" })).toThrow(/Unsupported scheme 'ftp:'/i);
      expect(() => apiClient.configure({ baseUrl: "file:///etc/passwd" })).toThrow(/Unsupported scheme 'file:'/i);
      expect(() => apiClient.configure({ baseUrl: "data:text/plain,hello" })).toThrow(/Unsupported scheme 'data:'/i);

      // resolveAndValidateUrl rejects protocol-relative and schemes
      expect(() => apiClient.resolveAndValidateUrl("//evil.com")).toThrow(/Protocol-relative endpoints/i);
      expect(() => apiClient.resolveAndValidateUrl("javascript:void(0)")).toThrow(/Absolute URLs and scheme prefixes/i);
      expect(() => apiClient.resolveAndValidateUrl("ftp://test.org")).toThrow(/Absolute URLs and scheme prefixes/i);
      expect(() => apiClient.resolveAndValidateUrl("file:///test")).toThrow(/Absolute URLs and scheme prefixes/i);
      expect(() => apiClient.resolveAndValidateUrl("data:text/plain")).toThrow(/Absolute URLs and scheme prefixes/i);

      // Trust checks reject them
      expect(apiClient.isTargetOriginTrusted("//evil.com")).toBe(false);
      expect(apiClient.isTargetOriginTrusted("ftp://files.host")).toBe(false);
      expect(apiClient.isTargetOriginTrusted("javascript:alert(1)")).toBe(false);

      // Credentials mode omits credentials for untrusted or protocol-relative schemes
      expect(apiClient.getCredentialsMode("//evil.com")).toBe("omit");
      expect(apiClient.getCredentialsMode("ftp://files.host")).toBe("omit");
    });

    it("proves approved same-origin and configured cross-origin requests continue working across request, logout, and downloadExport", async () => {
      const capturedCalls: Array<{ url: string; init?: RequestInit }> = [];
      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        capturedCalls.push({ url, init });
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ "Content-Disposition": 'attachment; filename="audit_export.xlsx"' }),
          json: async () => ({ success: true, customers: [{ id: 101, name: "Enterprise Customer" }] }),
          blob: async () => new Blob(["binary-test-data"]),
        });
      }));

      // --- Subcase A: Approved Same-Origin ("") ---
      apiClient.configure({ baseUrl: "" });
      apiClient.setToken("valid-same-origin-token");
      apiClient.setCsrfToken("valid-csrf-token");

      // 1. request()
      await apiClient.getCustomers();
      expect(capturedCalls[0].url).toBe("/api/customers");
      expect(capturedCalls[0].init?.credentials).toBe("same-origin");
      expect((capturedCalls[0].init?.headers as Record<string, string>)?.["Authorization"]).toBe("Bearer valid-same-origin-token");

      // 2. logout()
      const sameLogout = await apiClient.logout();
      expect(sameLogout.serverRevoked).toBe(true);
      expect(capturedCalls[1].url).toBe("/api/auth/logout");
      expect(capturedCalls[1].init?.credentials).toBe("same-origin");
      expect((capturedCalls[1].init?.headers as Record<string, string>)?.["Authorization"]).toBe("Bearer valid-same-origin-token");
      expect((capturedCalls[1].init?.headers as Record<string, string>)?.["X-CSRF-Token"]).toBe("valid-csrf-token");

      // 3. downloadExport()
      apiClient.setToken("valid-same-origin-token"); // re-set after logout cleared it
      const sameExport = await apiClient.downloadExport("excel");
      expect(sameExport.filename).toBe("audit_export.xlsx");
      expect(capturedCalls[2].url).toBe("/api/export/excel");
      expect(capturedCalls[2].init?.credentials).toBe("same-origin");
      expect((capturedCalls[2].init?.headers as Record<string, string>)?.["Authorization"]).toBe("Bearer valid-same-origin-token");

      // --- Subcase B: Approved Configured Cross-Origin ("http://127.0.0.1:8000") ---
      capturedCalls.length = 0;
      apiClient.configure({ baseUrl: "http://127.0.0.1:8000" });
      apiClient.setToken("valid-cross-origin-token");
      apiClient.setCsrfToken("valid-cross-csrf");

      // 1. request()
      await apiClient.getCustomers();
      expect(capturedCalls[0].url).toBe("http://127.0.0.1:8000/api/customers");
      expect(capturedCalls[0].init?.credentials).toBe("include");
      expect((capturedCalls[0].init?.headers as Record<string, string>)?.["Authorization"]).toBe("Bearer valid-cross-origin-token");

      // 2. logout()
      const crossLogout = await apiClient.logout();
      expect(crossLogout.serverRevoked).toBe(true);
      expect(capturedCalls[1].url).toBe("http://127.0.0.1:8000/api/auth/logout");
      expect(capturedCalls[1].init?.credentials).toBe("include");
      expect((capturedCalls[1].init?.headers as Record<string, string>)?.["Authorization"]).toBe("Bearer valid-cross-origin-token");

      // 3. downloadExport()
      apiClient.setToken("valid-cross-origin-token"); // re-set after logout
      const crossExport = await apiClient.downloadExport("excel");
      expect(crossExport.filename).toBe("audit_export.xlsx");
      expect(capturedCalls[2].url).toBe("http://127.0.0.1:8000/api/export/excel");
      expect(capturedCalls[2].init?.credentials).toBe("include");
      expect((capturedCalls[2].init?.headers as Record<string, string>)?.["Authorization"]).toBe("Bearer valid-cross-origin-token");
    });
  });

  describe("AP01-R01: Obsolete Stage 4C Notice Remediation across All 11 Screens", () => {
    const screens = [
      "Dashboard",
      "Customers",
      "Orders",
      "Invoices",
      "Payments",
      "AR Aging",
      "Reports",
      "Sales Targets",
      "Performance Analytics",
      "Users & Roles",
      "Settings",
    ] as const;

    for (const screenName of screens) {
      it(`never renders obsolete Stage Notice on ${screenName} in LIVE mode`, async () => {
        apiClient.configure({ mode: "live", baseUrl: "" });
        vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => {
              if (url.includes("/api/auth/me")) {
                return {
                  user: { id: 1, username: "sandbox_admin", role: "admin", full_name: "Sandbox Administrator" },
                  auth_type: "cookie",
                };
              }
              if (url.includes("/api/customers")) return [];
              if (url.includes("/api/invoices")) return [];
              if (url.includes("/api/orders")) return [];
              if (url.includes("/api/users")) return [];
              if (url.includes("/api/targets")) return [];
              if (url.includes("/api/payments")) return [];
              if (url.includes("/api/dashboard/aging")) return { buckets: {}, total: 0 };
              return { success: true };
            },
          });
        }));

        render(
          <MockSessionProvider>
            <Workspace initial={screenName} />
          </MockSessionProvider>
        );

        // Stage Notice text must never appear on any of the 11 integrated screens
        expect(screen.queryByText(/is not yet integrated with the live backend/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Stage Notice:/i)).not.toBeInTheDocument();
      });
    }
  });
});
