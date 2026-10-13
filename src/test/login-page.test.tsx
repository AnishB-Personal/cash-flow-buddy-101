import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { LoginPage } from "../components/collectflow/login-page";
import { apiClient } from "../lib/api-client";

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  };
});

describe("LoginPage Superseded Authentication Safeguards", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
    apiClient.configure({ mode: "live", baseUrl: "http://127.0.0.1:8000" });
    apiClient.clearSession();
  });

  it("superseded login completion does NOT display stale success or trigger navigation", async () => {
    const userA = { id: 1, username: "userA", role: "sales" as const, full_name: "User A" };
    const userB = { id: 2, username: "userB", role: "admin" as const, full_name: "User B" };

    let resolveLoginA: (val: any) => void;
    const delayedLoginAPromise = new Promise((resolve) => {
      resolveLoginA = resolve;
    });

    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, options: any) => {
      const body = typeof options?.body === "string" ? JSON.parse(options.body) : options?.body;
      if (body?.username === "userA") {
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

    render(<LoginPage />);
    const form = screen.getByLabelText(/Username/i).closest("form")!;

    // 1. Submit User A
    fireEvent.change(screen.getByLabelText(/Username/i), { target: { value: "userA" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "PasswordA!" } });
    fireEvent.submit(form);

    // 2. Before User A returns, submit User B (more recent intended login)
    fireEvent.change(screen.getByLabelText(/Username/i), { target: { value: "userB" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "PasswordB!" } });
    fireEvent.submit(form);

    // User B resolves first
    await waitFor(() => {
      expect(screen.getByText(/Authenticated as userB/i)).toBeInTheDocument();
    });

    // 3. User A now resolves late in reverse order
    resolveLoginA!({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        token: "token-userA",
        user: userA,
      }),
    });

    // Wait for settling and navigation timeout
    await new Promise((r) => setTimeout(r, 400));

    // Must NOT display User A or overwrite User B
    expect(screen.queryByText(/Authenticated as userA/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Authenticated as userB/i)).toBeInTheDocument();

    // Navigation was triggered for User B
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it("superseded login failure does NOT overwrite newer successful login state", async () => {
    const userB = { id: 2, username: "userB", role: "admin" as const, full_name: "User B" };

    let rejectLoginA: (val: any) => void;
    const delayedLoginAPromise = new Promise((_, reject) => {
      rejectLoginA = reject;
    });

    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, options: any) => {
      const body = typeof options?.body === "string" ? JSON.parse(options.body) : options?.body;
      if (body?.username === "userA") {
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

    render(<LoginPage />);
    const form = screen.getByLabelText(/Username/i).closest("form")!;

    // 1. Submit User A
    fireEvent.change(screen.getByLabelText(/Username/i), { target: { value: "userA" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "PasswordA!" } });
    fireEvent.submit(form);

    // 2. Submit User B (succeeds)
    fireEvent.change(screen.getByLabelText(/Username/i), { target: { value: "userB" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "PasswordB!" } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Authenticated as userB/i)).toBeInTheDocument();
    });

    // 3. User A fails late with 401
    rejectLoginA!(new Error("Invalid credentials for userA"));

    await new Promise((r) => setTimeout(r, 100));

    // Stale error must NOT overwrite the success banner
    expect(screen.queryByText(/Invalid credentials for userA/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/Authenticated as userB/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
    });
  });

  it("logout invalidates pending login and prevents delayed success display or navigation", async () => {
    const userA = { id: 1, username: "userA", role: "sales" as const, full_name: "User A" };

    let resolveLoginA: (val: any) => void;
    const delayedLoginAPromise = new Promise((resolve) => {
      resolveLoginA = resolve;
    });

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/auth/logout")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
      }
      return delayedLoginAPromise;
    }));

    render(<LoginPage />);
    const form = screen.getByLabelText(/Username/i).closest("form")!;

    // 1. Submit User A
    fireEvent.change(screen.getByLabelText(/Username/i), { target: { value: "userA" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "PasswordA!" } });
    fireEvent.submit(form);

    // 2. User logs out while login is pending
    await apiClient.logout();

    // 3. Late login response arrives
    await act(async () => {
      resolveLoginA!({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          token: "token-userA",
          user: userA,
        }),
      });
      await new Promise((r) => setTimeout(r, 400));
    });

    // Success must NOT be shown
    expect(screen.queryByText(/Authenticated as userA/i)).not.toBeInTheDocument();
    // Navigation must NOT be called
    expect(mockNavigate).not.toHaveBeenCalled();
    // In-memory session must be null
    expect(apiClient.getToken()).toBeNull();
  });
});
